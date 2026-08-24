import type { Creep, Structure } from 'game/prototypes';
import type { CostMatrix } from 'game/path-finder';
import type { Position } from 'game/prototypes/game-object';
import { getRange } from 'game/utils';
import { arenaInfo } from 'game';
import { firepower, isArmed, meleeDamage, rangedDamage } from '../../lib/body';
import { hitsOf, mostWounded, pickTarget } from '../../lib/combat';
import { fleeFrom, travelTo } from '../../lib/movement';
import { energyIn } from '../../lib/world';
import type { World } from '../../lib/world';
import { HOME_GUARD, flagById, musterPoint } from './plan';
import type { Plan } from './plan';
import { roleOf, stillBuilding } from './production';

/** An attack is only worth launching if it can flatten a spawn this fast. */
const BURST_TICKS = 8;
/** Ticks of slack demanded before we trust a straight race and stop defending. */
const RACE_MARGIN = 40;
/**
 * How far a defender will step off the spawn to meet something. Kept short on
 * purpose: an attacker that can pull the garrison out of position and walk back
 * in behind it has beaten the garrison without fighting it. Anything that can
 * actually hurt the spawn has to come inside this ring to do it.
 */
const ENGAGE_RANGE = 8;
/** How far a squad member may trail the spearhead before it must close up. */
const GROUP_RADIUS = 8;
/**
 * Fraction of the match after which the army commits no matter what the race
 * says. Running the clock out is a draw rather than a win, so the tail of the
 * match has to be spent attacking; the margin leaves time for the walk.
 */
const PUSH_DEADLINE = 0.45;
/** A hunter below this fraction of its hit points disengages. */
const HUNTER_BINGO = 0.35;

// --- shared actions ---------------------------------------------------------

/**
 * Attacking and moving are independent actions, so every armed creep swings
 * every tick regardless of where it is going. `attack` and `rangedAttack` do
 * not conflict with each other, but both conflict with `heal`, which is why
 * healing lives on separate creeps.
 */
function strike(creep: Creep, w: World, wedged: boolean): void {
  if (meleeDamage(creep) > 0) {
    const target = meleeTargetFor(creep, w, wedged);
    if (target) creep.attack(target);
  }
  if (rangedDamage(creep) > 0) {
    const shot = pickTarget(creep, w.enemyCreeps, 3);
    if (shot) creep.rangedAttack(shot);
    else if (w.enemySpawn && getRange(creep, w.enemySpawn) <= 3) creep.rangedAttack(w.enemySpawn);
  }
}

function meleeTargetFor(creep: Creep, w: World, wedged: boolean): Creep | Structure | undefined {
  // Destroying the enemy spawn ends the match, so it outranks everything.
  if (w.enemySpawn && getRange(creep, w.enemySpawn) <= 1) return w.enemySpawn;

  const enemy = pickTarget(creep, w.enemyCreeps, 1);
  if (enemy) return enemy;

  // Extensions are 100 hits apiece and hold the enemy's unspent energy, so
  // smashing one in passing is pure profit.
  const extension = w.enemyExtensions.find(e => getRange(creep, e) <= 1);
  if (extension) return extension;

  if (wedged) {
    const blocker =
      w.ramparts.find(r => r.my === false && getRange(creep, r) <= 1) ??
      w.walls.find(s => getRange(creep, s) <= 1);
    if (blocker) return blocker;
  }
  return undefined;
}

function mend(creep: Creep, w: World): void {
  const close = mostWounded(creep, w.myCreeps, 1);
  if (close) {
    creep.heal(close);
    return;
  }
  const far = mostWounded(creep, w.myCreeps, 3);
  if (far) creep.rangedHeal(far);
}

// --- reading the race ------------------------------------------------------

/**
 * How long until `creeps` flatten a `hits`-point structure at `goal`, counting
 * the walk. Arrivals are folded in one at a time, so a lone creep two hundred
 * tiles away does not get credited with damage it cannot deliver yet.
 */
function clockToKill(plan: Plan, creeps: Creep[], goal: Position, hits: number): number {
  if (hits <= 0) return 0;
  const wave = creeps
    .map(c => ({ eta: eta(plan, c, goal), dps: firepower(c) }))
    .filter(step => step.dps > 0)
    .sort((a, b) => a.eta - b.eta);

  let now = 0;
  let done = 0;
  let dps = 0;
  for (const step of wave) {
    const span = step.eta - now;
    if (dps > 0 && done + dps * span >= hits) return now + (hits - done) / dps;
    done += dps * span;
    now = step.eta;
    dps += step.dps;
  }
  return dps > 0 ? now + (hits - done) / dps : Infinity;
}

/**
 * Ticks for a creep to reach a position. Straight-line range badly understates
 * travel on this map — the terrain is a maze and the real route between the two
 * bases is about twice the direct distance — so it is scaled by the detour
 * factor measured on the actual road between the spawns.
 */
function eta(plan: Plan, creep: Creep, goal: Position): number {
  return getRange(creep, goal) * plan.detour;
}

/** Armed enemies close enough to our spawn to be worth swinging at. */
function homeThreats(w: World, plan: Plan): Creep[] {
  return w.enemyCreeps.filter(e => isArmed(e) && getRange(e, plan.home) <= HOME_GUARD);
}

interface Orders {
  /** Ids held back to cover the spawn. Empty whenever nothing is inbound. */
  defenders: Set<string>;
  /** Whether the strike force should set out at all yet. */
  committed: boolean;
}

/**
 * Decide, from what is actually on the board this tick, how the army splits.
 *
 * There is no standing garrison and no fixed number of defenders: we work out
 * when each side's spawn would fall if nobody changed course, and hold back the
 * fewest creeps whose firepower matches what is walking at us — none at all when
 * nothing is, and every last one when the answer is "we lose this race".
 */
function orderSquad(w: World, plan: Plan, armed: Creep[]): Orders {
  const none = new Set<string>();
  if (w.tick > deadline()) return { defenders: none, committed: true };

  const committed = canFinish(w, armed);
  const enemies = w.enemyCreeps.filter(isArmed);
  const enemyDps = enemies.reduce((sum, c) => sum + firepower(c), 0);
  if (enemyDps === 0) return { defenders: none, committed };

  // Both clocks already price in the walk, so an enemy parked on its own spawn
  // scores as no threat at all without needing a separate distance cutoff.
  const ours = clockToKill(plan, armed, plan.target, hitsOf(w.enemySpawn));
  const theirs = clockToKill(plan, enemies, plan.home, hitsOf(w.mySpawn));
  if (committed && ours + RACE_MARGIN < theirs) return { defenders: none, committed };

  // We would lose that race, so hold back the creeps that can get home before
  // the blow lands — nearest first — until they out-gun what is coming.
  const defenders = new Set<string>();
  let held = 0;
  const reachable = armed
    .filter(c => eta(plan, c, plan.home) <= theirs)
    .sort((a, b) => getRange(a, plan.home) - getRange(b, plan.home));
  for (const creep of reachable) {
    if (held >= enemyDps) break;
    defenders.add(String(creep.id));
    held += firepower(creep);
  }
  return { defenders, committed };
}

/**
 * The tick by which we must be attacking. `arenaInfo` is read lazily rather than
 * at module load, since the sandbox does not guarantee it is populated yet.
 */
let deadlineTick: number | undefined;

function deadline(): number {
  if (deadlineTick === undefined) deadlineTick = Math.floor(arenaInfo.ticksLimit * PUSH_DEADLINE);
  return deadlineTick;
}

/** Latched the first time the army is judged strong enough to set out. */
let launched = false;

/**
 * Whether the strike force is worth launching. A single brawler that trickles
 * into a defended base dies for nothing, so we wait until the group can flatten
 * the spawn in a handful of ticks — and until the spawn back home has stopped
 * adding to it, because energy sitting in extensions buys nothing and can be
 * taken off us by a raider.
 */
function canFinish(w: World, armed: Creep[]): boolean {
  const dps = armed.reduce((sum, c) => sum + firepower(c), 0);
  if (dps * BURST_TICKS < hitsOf(w.enemySpawn)) return false;
  // Only the *first* launch waits on the spawn. Once the army is out, energy
  // trickling back in at one a tick must not keep calling it home.
  if (!launched && stillBuilding(w)) return false;
  launched = true;
  return true;
}

// --- runners ----------------------------------------------------------------

/**
 * The two flags in the central keep hand their rampart group to whoever stands
 * on them, and a creep parked on a flag also physically denies the tile. A
 * single MOVE part generates no fatigue, so it crosses swamp at full speed —
 * the fastest thing on the map, for 50 energy.
 */
export function runRunners(w: World, plan: Plan, matrix: CostMatrix): void {
  const runners = w.myCreeps.filter(c => roleOf(c) === 'runner');
  if (runners.length === 0) return;

  const spare = new Set(runners);
  for (const id of plan.flagIds) {
    const flag = flagById(w, id);
    if (!flag) continue;
    let best: Creep | undefined;
    let bestRange = Infinity;
    for (const runner of spare) {
      const range = getRange(runner, flag);
      if (range < bestRange) {
        bestRange = range;
        best = runner;
      }
    }
    if (!best) break;
    spare.delete(best);
    if (bestRange > 0) travelTo(best, flag, matrix, 0);
  }

  // Anything left over waits on the nearest flag we do not yet control.
  for (const runner of spare) {
    const contested = w.flags.filter(f => f.my !== true);
    if (contested.length > 0) travelTo(runner, nearestTo(runner, contested), matrix, 1);
  }
}

// --- hunter -----------------------------------------------------------------

/** Per-hunter cooldown on chasing a flag the enemy has walled itself in behind. */
const flagBan = new Map<string, number>();
const FLAG_BAN = 80;

/**
 * One fast, cheap raider. It takes the middle first, then lives in the enemy's
 * extension bank: every extension it breaks is 100 energy the enemy never gets
 * to spend, and they are only 100 hits each.
 */
export function runHunter(w: World, plan: Plan, matrix: CostMatrix): void {
  for (const creep of w.myCreeps) {
    if (roleOf(creep) !== 'hunter') continue;
    const key = String(creep.id);

    const hurt = creep.hits < creep.hitsMax * HUNTER_BINGO;
    const onTheSpawn = w.enemySpawn !== undefined && getRange(creep, w.enemySpawn) <= 1;
    if (hurt && !onTheSpawn) {
      const shooters = w.enemyCreeps.filter(e => isArmed(e) && getRange(creep, e) <= 6);
      if (shooters.length > 0) {
        strike(creep, w, false);
        fleeFrom(creep, shooters, matrix);
        continue;
      }
    }

    const goal = hunterGoal(w, plan, creep, (flagBan.get(key) ?? 0) > w.tick);
    const result = travelTo(creep, goal.pos, matrix, goal.range);
    // A flag the enemy has sealed behind its own ramparts is not worth 10k hits
    // of chewing; go take their extensions apart instead.
    if (goal.kind === 'flag' && !result.reachable) flagBan.set(key, w.tick + FLAG_BAN);
    strike(creep, w, result.wedged);
  }
}

interface Goal {
  pos: Position;
  range: number;
  kind: 'threat' | 'flag' | 'raid';
}

function hunterGoal(w: World, plan: Plan, creep: Creep, skipFlags: boolean): Goal {
  // Answer a home alarm only while we are still nearer to our own spawn than to
  // the enemy's; past the halfway mark, turning round helps nobody.
  const threats = homeThreats(w, plan);
  if (threats.length > 0 && getRange(creep, plan.home) < getRange(creep, plan.target)) {
    return { pos: nearestTo(plan.home, threats), range: 1, kind: 'threat' };
  }

  if (!skipFlags) {
    const contested = w.flags.filter(f => f.my !== true);
    if (contested.length > 0) return { pos: nearestTo(creep, contested), range: 0, kind: 'flag' };
  }

  const loaded = w.enemyExtensions.filter(e => energyIn(e.store) > 0);
  if (loaded.length > 0) return { pos: nearestTo(creep, loaded), range: 1, kind: 'raid' };

  return { pos: plan.target, range: 1, kind: 'raid' };
}

// --- main army --------------------------------------------------------------

/**
 * Brawlers and medics move and fight as one body, split each tick between
 * covering the spawn and going for the kill by {@link orderSquad}. Medics chase
 * whoever is most hurt, so they follow the fighting rather than a fixed post.
 */
export function runSquad(w: World, plan: Plan, matrix: CostMatrix): void {
  const squad = w.myCreeps.filter(c => {
    const role = roleOf(c);
    return role === 'brawler' || role === 'medic';
  });
  if (squad.length === 0) return;

  const armed = squad.filter(c => firepower(c) > 0);
  const { defenders, committed } = orderSquad(w, plan, armed);
  const strikeForce = armed.filter(c => !defenders.has(String(c.id)));
  const threats = homeThreats(w, plan);
  const muster = musterPoint(w, plan);
  // The spearhead is whoever is furthest along; stragglers close up on it.
  const leader = strikeForce.length > 0 ? nearestTo(plan.target, strikeForce) : undefined;

  for (const creep of squad) {
    let goal: Position;
    let range = 1;

    if (roleOf(creep) === 'medic') {
      const patient = mostWounded(creep, squad, 20);
      goal =
        patient ?? (committed && leader ? leader : nearestTo(creep, armed.length ? armed : squad));
    } else if (defenders.has(String(creep.id)) || !committed) {
      // Holding: meet whatever has come inside the ring, otherwise sit on the
      // spawn and make them come to us.
      const close = threats.filter(e => getRange(e, plan.home) <= ENGAGE_RANGE);
      goal = close.length > 0 ? nearestTo(plan.home, close) : muster;
      range = close.length > 0 ? 1 : 2;
    } else if (leader && creep !== leader && getRange(creep, leader) > GROUP_RADIUS) {
      goal = leader;
    } else {
      goal = plan.target;
    }

    const wedged =
      getRange(creep, goal) > range ? travelTo(creep, goal, matrix, range).wedged : false;
    if (roleOf(creep) === 'medic') mend(creep, w);
    else strike(creep, w, wedged);
  }
}

/** Per-creep state here is keyed by creep id, so it has to be swept too. */
export function pruneTactics(aliveIds: Set<string>): void {
  for (const id of flagBan.keys()) if (!aliveIds.has(id)) flagBan.delete(id);
}

function nearestTo<T extends Position>(pos: Position, candidates: T[]): T {
  let best = candidates[0]!;
  let bestRange = getRange(pos, best);
  for (const candidate of candidates) {
    const range = getRange(pos, candidate);
    if (range < bestRange) {
      bestRange = range;
      best = candidate;
    }
  }
  return best;
}
