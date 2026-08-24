import { arenaInfo } from 'game';
import type { Creep, Structure } from 'game/prototypes';
import type { CostMatrix } from 'game/path-finder';
import type { Position } from 'game/prototypes/game-object';
import { getRange } from 'game/utils';
import { isArmed, meleeDamage, rangedDamage } from '../../lib/body';
import { hitsOf, mostWounded, pickTarget } from '../../lib/combat';
import { fleeFrom, travelTo } from '../../lib/movement';
import { energyIn } from '../../lib/world';
import type { World } from '../../lib/world';
import { HOME_GUARD, flagById, rallyPoint } from './plan';
import type { Plan } from './plan';
import { openingDone, roleOf } from './production';

/** How far a squad member may stray from the spearhead before it must close up. */
const GROUP_RADIUS = 8;
/**
 * Push no later than this even if the army never looks ready — a draw is not a
 * win. Read from the arena rather than hardcoded, so a different tick limit
 * does not silently leave the army standing at home until time runs out.
 * Read lazily: `arenaInfo` is not guaranteed to be populated at module load.
 */
function latestPush(): number {
  return Math.floor(arenaInfo.ticksLimit * 0.55);
}
/** A hunter below this fraction of its hit points disengages. */
const HUNTER_BINGO = 0.35;

let pushing = false;

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

// --- runners ----------------------------------------------------------------

/**
 * The two flags in the central keep hand their rampart group to whoever stands
 * on them, and a creep parked on a flag also physically denies the tile. A
 * single MOVE part is all this costs and it outruns everything on the map.
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
    const goal = contested.length > 0 ? runner.findClosestByRange(contested) : undefined;
    travelTo(runner, goal ?? rallyPoint(w, plan, matrix), matrix, 1);
  }
}

// --- hunter -----------------------------------------------------------------

/**
 * One fast, cheap raider. Its job order is: keep the middle, then delete the
 * enemy's extensions before they can spend what is in them.
 */
export function runHunter(w: World, plan: Plan, matrix: CostMatrix): void {
  for (const creep of w.myCreeps) {
    if (roleOf(creep) !== 'hunter') continue;
    const key = String(creep.id);

    const hurt = creep.hits < creep.hitsMax * HUNTER_BINGO;
    const nearSpawn = w.enemySpawn !== undefined && getRange(creep, w.enemySpawn) <= 1;
    if (hurt && !nearSpawn) {
      const shooters = w.enemyCreeps.filter(e => isArmed(e) && getRange(creep, e) <= 6);
      if (shooters.length > 0) {
        strike(creep, w, false);
        fleeFrom(creep, shooters, matrix);
        continue;
      }
    }

    const goal = hunterGoal(w, plan, (flagBan.get(key) ?? 0) > w.tick);
    const result = travelTo(creep, goal.pos, matrix, goal.range);
    // A flag the enemy has walled in behind its own ramparts is not worth
    // 10k hits of chewing; go take their extensions apart instead.
    if (goal.kind === 'flag' && !result.reachable) flagBan.set(key, w.tick + FLAG_BAN);
    strike(creep, w, result.wedged);
  }
}

/** Per-hunter cooldown on chasing an unreachable flag. */
const flagBan = new Map<string, number>();
const FLAG_BAN = 60;

interface Goal {
  pos: Position;
  range: number;
  kind: 'threat' | 'flag' | 'raid';
}

function hunterGoal(w: World, plan: Plan, skipFlags: boolean): Goal {
  const threats = w.enemyCreeps.filter(e => isArmed(e) && getRange(e, plan.home) <= HOME_GUARD);
  if (threats.length > 0) return { pos: nearestTo(plan.home, threats), range: 1, kind: 'threat' };

  if (!skipFlags) {
    const contested = w.flags.filter(f => f.my !== true);
    if (contested.length > 0) {
      return { pos: nearestTo(plan.home, contested), range: 0, kind: 'flag' };
    }
  }

  // Every extension still holding energy is energy the enemy has not spent yet,
  // and they only have 100 hits each.
  const loaded = w.enemyExtensions.filter(e => energyIn(e.store) > 0);
  if (loaded.length > 0) return { pos: nearestTo(plan.home, loaded), range: 1, kind: 'raid' };

  return { pos: plan.target, range: 1, kind: 'raid' };
}

// --- main army --------------------------------------------------------------

/**
 * Brawlers and medics move and fight as one body. They gather on our ramparts —
 * where they cannot be damaged at all — then commit once the build order is
 * spent, because piecemeal arrivals lose to a massed defence.
 */
export function runSquad(w: World, plan: Plan, matrix: CostMatrix): void {
  const squad = w.myCreeps.filter(c => {
    const role = roleOf(c);
    return role === 'brawler' || role === 'medic';
  });
  if (squad.length === 0) return;

  const rally = rallyPoint(w, plan, matrix);
  // Built once per tick rather than rescanned inside shelter() for every
  // (creep, rampart) pair.
  const occupied = new Set(w.myCreeps.map(c => `${c.x},${c.y}`));
  // `undefined` means hold: the army is not assembled yet, so it waits.
  const objective = squadObjective(w, plan, squad);
  const anchor = nearestTo(objective ?? rally, squad);
  const grouped = squad.filter(c => getRange(c, anchor) <= GROUP_RADIUS);
  const cohesive = grouped.length * 2 >= squad.length;

  for (const creep of squad) {
    const medic = roleOf(creep) === 'medic';
    let wedged = false;

    if (getRange(creep, anchor) > GROUP_RADIUS) {
      // Reinforcements walk to the army rather than to the objective alone.
      wedged = travelTo(creep, anchor, matrix, 1).wedged;
    } else if (objective) {
      const patient = medic ? mostWounded(creep, squad, 20) : undefined;
      if (patient) wedged = travelTo(creep, patient, matrix, 1).wedged;
      else if (medic) wedged = travelTo(creep, anchor, matrix, 1).wedged;
      else if (cohesive) wedged = travelTo(creep, objective, matrix, 1).wedged;
    } else {
      const post = shelter(w, creep, rally, occupied);
      if (post) {
        if (getRange(creep, post) > 0) wedged = travelTo(creep, post, matrix, 0).wedged;
      } else if (getRange(creep, rally) > 2) {
        wedged = travelTo(creep, rally, matrix, 2).wedged;
      }
    }

    if (medic) mend(creep, w);
    else strike(creep, w, wedged);
  }
}

function squadObjective(w: World, plan: Plan, squad: Creep[]): Position | undefined {
  // If we are one swing from ending the match, nothing else matters.
  const nearlyWon = hitsOf(w.enemySpawn) <= 1200 && squad.some(c => getRange(c, plan.target) <= 8);

  const threats = w.enemyCreeps.filter(e => isArmed(e) && getRange(e, plan.home) <= HOME_GUARD);
  if (threats.length > 0 && !nearlyWon) return nearestTo(plan.home, threats);

  return ready(w, squad) ? plan.target : undefined;
}

function ready(w: World, squad: Creep[]): boolean {
  if (pushing) return true;
  const built = openingDone() && !w.mySpawn?.spawning;
  const broke = w.energyAvailable < 450;
  if ((built || broke) && squad.length >= 2) pushing = true;
  if (w.tick > latestPush()) pushing = true;
  return pushing;
}

/**
 * The best free rampart tile to wait on: close to us, close to the muster
 * point, and — because it is a rampart — immune to enemy fire.
 */
function shelter(
  w: World,
  creep: Creep,
  anchor: Position,
  occupied: Set<string>,
): Position | undefined {
  let best: Position | undefined;
  let bestScore = Infinity;
  for (const rampart of w.myRamparts) {
    if (getRange(rampart, anchor) > 12) continue;
    const standingHere = rampart.x === creep.x && rampart.y === creep.y;
    if (!standingHere && occupied.has(`${rampart.x},${rampart.y}`)) continue;
    const score = getRange(creep, rampart) + getRange(rampart, anchor);
    if (score < bestScore) {
      bestScore = score;
      best = { x: rampart.x, y: rampart.y };
    }
  }
  return best;
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
