import {
  ATTACK,
  EFF_DAMAGE_TAKEN_MODIFIER,
  HEAL,
  HEAL_POWER,
  MOVE,
  RANGED_ATTACK,
} from 'game/constants';
import type { CostMatrix } from 'game/path-finder';
import type { Creep } from 'game/prototypes';
import type { Position } from 'game/prototypes/game-object';
import { getRange } from 'game/utils';
import { countParts, isArmed, meleeDamage, rangedDamage } from '../../lib/body';
import { fleeFrom, travelTo } from '../../lib/movement';
import type { FlagPlan } from './flags';
import type { State } from './state';
import { CENTRE_DELAY, isRunner } from './state';
import { centroid } from './terrain';
import { disarmed, focusTarget, healNeed, healTarget, newTick } from './targets';

/**
 * Stronger than the enemy by this much, go and end the match by wiping them.
 * Set high: attacking an army that holds its ground loses even from ahead, and
 * at 1.25 we left the centre to hunt temik911 and lost the fight.
 */
const HUNT_RATIO = 1.6;
/**
 * Against an enemy that left the centre alone, the old threshold. Odiodin
 * weakens itself taking flags when we sit on one, and hunting it at 1.25 won
 * four games of four.
 */
const HUNT_RATIO_OPEN = 1.25;
/** Hunting, armed enemies this close to the army are killed before flags are taken. */
const HUNT_REACH = 12;
/** A hunt target this far from the army is given up for a nearer one. */
const HUNT_KEEP = 20;
/**
 * When losing on score, attack anyway from this tick. It was 600: against
 * RickStallion, which guarded each flag with two or three creeps, we sat on
 * two flags at 1.23 times its strength from tick 300 to 600 while it scored
 * 18 a tick to our 7.
 */
const DESPERATE_AFTER = 200;
/** ...if not clearly weaker. */
const DESPERATE_RATIO = 0.9;
/** Weaker than this while ahead on score, stay out of their reach and run the clock. */
const EVADE_RATIO = 0.7;
/**
 * Evading only works from a distance. Turning to run from an enemy already in
 * range hands it free shots at our backs, so inside this we fight instead.
 */
const EVADE_MIN_GAP = 8;
/** An armed enemy this close to the army's centre puts the whole army in the fight. */
const CONTACT_RANGE = 8;
/** Guarding, enemies further than this from the flag are left to come to us. */
const GUARD_LEASH = 4;
/** Enemy scouts this close to a flag of ours draw a picket. */
const PICKET_RANGE = 8;
/** ...unless an armed enemy is this close to the scout. */
const PICKET_SAFE = 10;
/** In a fight, members further than this from the centre close up before engaging. */
const REJOIN_RANGE = 7;

/** A flag-sitting scout is fair game only with no armed enemy this close to it. */
const UNBLOCK_SAFE = 15;
/**
 * Enemies this close to an owned flag are a raid worth meeting. Kept tight: at
 * seven tiles, temik911 holding position just off the centre counted as a raid
 * and pulled our army out of the centre into its block.
 */
const RAID_RANGE = 3;
/** Escorting a capture, everyone but the capturer stays this far from the flag. */
const ESCORT_STANDOFF = 3;
/** How far the leader lets the group spread before it waits. */
const GROUP_RADIUS = 5;
/**
 * Members further than this are not waited for. A creep that has lost its MOVE
 * parts or is wedged somewhere would otherwise hold the whole army in place.
 */
const STRAGGLER_RANGE = 15;

export type Mode = 'hunt' | 'escort' | 'defend' | 'unblock' | 'guard' | 'evade' | 'cleanup';

export interface Orders {
  mode: Mode;
  target: Position | undefined;
  range: number;
}

/** Mass attack once the summed falloff of enemies in range reaches this (one adjacent = 1). */
const MASS_THRESHOLD = 1.8;
/** How far a ranged creep will walk to get next to an enemy crowd. */
const CROWD_REACH = 4;
/** RANGED_ATTACK_DISTANCE_RATE from docs/api/Constants.md, as the mass attack falloff. */
const MASS_RATE = [1, 1, 0.4, 0.1];

export function armyOf(s: State): Creep[] {
  return s.myCreeps.filter(c => !isRunner(c, s));
}

/**
 * Decide what the army as a whole is doing this tick. Order matters: a clear
 * strength advantage ends the match outright, so it outranks everything; flags
 * we want but cannot reach with a runner need the army to walk there; a raid
 * on a flag we hold must be met; otherwise sit between the enemy and our flags.
 */
/** How far back from the centre, toward our start, to hold meanwhile. */
const HOLD_BACK = 15;
/** Where our army started, for "our side". */
let home: Position | undefined;

/** The flag-sitter the army is committed to killing, kept across ticks. */
let quarry: string | undefined;

export function orders(s: State, plan: FlagPlan, runnersAlive: number): Orders {
  const army = armyOf(s);
  const here = centroid(army);
  home ??= here;
  const enemies = s.enemyCreeps.filter(isArmed);
  const enemyCenter = centroid(enemies);
  const owned = s.flags.filter(f => f.my === true);
  const comfortablyAhead =
    s.myScore + s.myRate * s.remaining - (s.enemyScore + s.enemyRate * s.remaining) >
    Math.max(200, 2 * s.remaining);

  const huntAt = s.centreContest === false ? HUNT_RATIO_OPEN : HUNT_RATIO;
  // Losing on the clock with no set of flags that fixes it, a sure loss on
  // score is worse than an uncertain fight. Three of ten rated games ended
  // this way: full armies, both sides parked, the enemy on the centre and 15
  // points a tick to our 10.
  const desperate = plan.margin < 0 && s.tick >= DESPERATE_AFTER && plan.ratio >= DESPERATE_RATIO;
  if (here && enemies.length > 0 && (plan.ratio >= huntAt || desperate)) {
    // Go for their flags rather than their creeps: a flag taken back flips the
    // score straight away, and they have to come to us to defend it. Chasing
    // creeps instead, we hunted RickStallion at three to eleven times its
    // strength for 900 ticks without catching anything while it scored 25 a
    // tick on all seven flags.
    //
    // But an armed enemy close by is killed first. felixnightshade split its
    // army into small groups that retook each flag as soon as our one army
    // moved on: we held 3 to 11 points a tick at two to four times its
    // strength, and it scored 15 to 22, for 1400 ticks. A group within reach
    // is the thing to kill, and dead creeps retake nothing.
    // Once chosen, a target is kept until it dies or gets well away: re-picking
    // every tick sent the army back and forth between RickStallion's small
    // flag guards for 600 ticks without finishing any of them.
    const chased = enemies.find(e => String(e.id) === quarry && getRange(e, here) <= HUNT_KEEP);
    const prey =
      chased ??
      closest(
        here,
        enemies.filter(e => getRange(e, here) <= HUNT_REACH),
      );
    if (prey) {
      quarry = String(prey.id);
      return { mode: 'hunt', target: prey, range: 1 };
    }
    const theirs = s.flags.filter(
      f => f.my === false && !s.enemyCreeps.some(e => e.x === f.x && e.y === f.y && isArmed(e)),
    );
    const flag = closest(here, theirs);
    if (flag) return { mode: 'escort', target: flag, range: 0 };
    // Every flag is held by an armed creep standing on it. therevilo2018 did
    // exactly that, one creep per flag, and we wandered between targets at two
    // to five times its strength, killing four creeps in 1100 ticks while it
    // scored 25 a tick. Pick one sitter, go and kill it, and do not switch
    // until it is dead: then its flag is free to take.
    const sitters = enemies.filter(e =>
      s.flags.some(f => f.my === false && f.x === e.x && f.y === e.y),
    );
    const kept = sitters.find(e => String(e.id) === quarry);
    const next = kept ?? closest(here, sitters) ?? closest(here, enemies);
    quarry = next ? String(next.id) : undefined;
    return { mode: 'hunt', target: next, range: 1 };
  }

  const gap = here ? Math.min(...enemies.map(e => getRange(e, here))) : 0;
  if (here && enemyCenter && plan.ratio < EVADE_RATIO && comfortablyAhead && gap > EVADE_MIN_GAP) {
    return { mode: 'evade', target: enemyCenter, range: 0 };
  }

  // Nothing armed left on their side, so nothing can punish a split army or a
  // debuff: every creep becomes a runner (see runners.ts).
  if (enemies.length === 0) return { mode: 'cleanup', target: undefined, range: 0 };

  const raid = enemies.find(e => owned.some(f => getRange(e, f) <= RAID_RANGE));
  if (raid) return { mode: 'defend', target: raid, range: 1 };

  // Losing on the clock with every flag spoken for: the enemy's flags are
  // usually held by a 100-hit scout standing on them. Kill one that has no
  // armed escort nearby, and the flag is ours to take. Found by playing an
  // earlier build, which parked its scouts and won on score while we stood
  // next to its flags.
  const projected = s.myScore + s.myRate * s.remaining - (s.enemyScore + s.enemyRate * s.remaining);
  if (here && projected < 0) {
    const sitters = s.enemyCreeps.filter(
      e =>
        !isArmed(e) &&
        s.flags.some(f => f.my === false && f.x === e.x && f.y === e.y) &&
        !enemies.some(a => getRange(a, e) <= UNBLOCK_SAFE) &&
        // Nor if their army is close to ours: leaving a standoff to chase a
        // scout hands them the fight on their terms.
        !(enemyCenter && getRange(enemyCenter, here) <= UNBLOCK_SAFE),
    );
    const sitter = closest(here, sitters);
    if (sitter) return { mode: 'unblock', target: sitter, range: 1 };
  }

  const pending = s.flags.filter(f => f.my !== true && plan.wanted.has(String(f.id)));
  if (pending.length > 0 && runnersAlive === 0 && here) {
    return { mode: 'escort', target: closest(here, pending), range: 0 };
  }

  // Hold the centre flag whenever it is ours or nobody's. temik911 beat us
  // forty games running by getting there first and holding it: whoever walks
  // into a held position loses the fight.
  // Until we know the enemy is leaving the centre alone, head there: against
  // one racing for it, arriving second loses.
  const centre = s.flags.find(f => f.effectType === EFF_DAMAGE_TAKEN_MODIFIER && f.my !== false);
  // Against a centre-racer, do not meet it there in the opening. Against
  // temik911 we lost 3 of 4 games where the armies first clashed around tick
  // 75 and won 4 of 6 where the first clash came after tick 250, by which
  // time it had spread out and weakened itself taking flags. Hold a position
  // fifteen tiles back on our side until then.
  if (centre && s.centreContest === true && s.tick < CENTRE_DELAY && home) {
    const back = {
      x: Math.round(
        centre.x + ((home.x - centre.x) * HOLD_BACK) / Math.max(1, getRange(home, centre)),
      ),
      y: Math.round(
        centre.y + ((home.y - centre.y) * HOLD_BACK) / Math.max(1, getRange(home, centre)),
      ),
    };
    return { mode: 'guard', target: back, range: 2 };
  }
  if (centre && s.centreContest !== false) {
    // Not yet ours but wanted: one creep steps onto it and the rest stand off.
    // Guarding at two tiles ringed it with our own army, and our scout stood
    // outside the ring for 1800 ticks of a real game with the score at zero.
    if (centre.my !== true && plan.wanted.has(String(centre.id))) {
      return { mode: 'escort', target: centre, range: 0 };
    }
    return { mode: 'guard', target: centre, range: 2 };
  }

  // Guard the owned flag the enemy is most likely to hit next, standing a step
  // off it so a creep of ours is not the thing parked on it.
  if (owned.length > 0) {
    const toward = enemyCenter ?? here;
    return { mode: 'guard', target: toward ? closest(toward, owned) : owned[0], range: 2 };
  }
  const anyFlag = here ? closest(here, s.flags) : undefined;
  return { mode: 'guard', target: anyFlag, range: 3 };
}

/** After losing hits, the army counts as under fire for this many ticks. */
const FIRE_MEMORY = 10;
let lastHits = 0;
let lastHitsTick = -1;
let hitAt = -Infinity;

function underFire(s: State): boolean {
  if (lastHitsTick !== s.tick) {
    const hits = s.myCreeps.reduce((sum, c) => sum + c.hits, 0);
    if (lastHitsTick >= 0 && hits < lastHits) hitAt = s.tick;
    lastHits = hits;
    lastHitsTick = s.tick;
  }
  return s.tick - hitAt <= FIRE_MEMORY;
}

export function runArmy(s: State, o: Orders, matrix: CostMatrix, army: Creep[] = armyOf(s)): void {
  if (army.length === 0) return;
  const enemies = s.enemyCreeps;
  const armed = enemies.filter(isArmed);
  const meleeEnemies = enemies.filter(e => meleeDamage(e) > 0);

  const anchor = pickAnchor(army, o.target);
  const spread = Math.max(
    0,
    ...army
      .filter(c => countParts(c, MOVE) > 0 && getRange(c, anchor) <= STRAGGLER_RANGE)
      .map(c => getRange(c, anchor)),
  );

  underFire(s);
  newTick(army, enemies);
  // Melee first: it has the fewest choices, so ranged fire fills in around it.
  const order = army
    .slice()
    .sort((a, b) => Number(countParts(b, ATTACK) > 0) - Number(countParts(a, ATTACK) > 0));
  for (const c of order) act(c, s);

  const healers = army.filter(c => countParts(c, HEAL) > 0);

  // The fight is a group decision. Deciding per creep let whoever was nearest
  // the enemy fight alone while the rest marched elsewhere, and in rated games
  // the enemy picked those off one at a time.
  const focus = closest(anchor, armed);
  const contact =
    focus !== undefined &&
    (getRange(anchor, focus) <= CONTACT_RANGE ||
      army.some(c => !disarmed(c) && armed.some(e => getRange(c, e) <= 3)));

  // One ranged creep peels off for an enemy scout heading for, or sitting on,
  // a flag on our side, as long as nothing armed is escorting it. Katterton
  // beat us on score by walking scouts round our army onto the flags behind
  // it: a scout has 100 hits, two shots.
  const owned = s.flags.filter(f => f.my === true);
  const prowlers = s.enemyCreeps.filter(
    e =>
      !isArmed(e) &&
      owned.some(f => getRange(e, f) <= PICKET_RANGE) &&
      !armed.some(a => getRange(a, e) <= PICKET_SAFE),
  );
  const prey = prowlers[0];
  const picket = prey
    ? closest(
        prey,
        army.filter(
          c => countParts(c, RANGED_ATTACK) > 0 && countParts(c, ATTACK) === 0 && !disarmed(c),
        ),
      )
    : undefined;
  const capturer =
    o.mode === 'escort' && o.target
      ? closest(
          o.target,
          army.filter(c => !disarmed(c)),
        )
      : undefined;

  for (const c of army) {
    if (o.mode === 'cleanup') continue;
    if (c === picket && prey) {
      travelTo(c, prey, matrix, 2);
      continue;
    }

    // A fighter with no weapons left gets next to a healer, which puts its
    // weapons back. It does not run: fleeing dragged the healers away from the
    // line after it, and its remaining hits still soak fire meant for others.
    if (disarmed(c)) {
      const biters = meleeEnemies.filter(e => getRange(c, e) <= 1);
      const medic = closest(
        c,
        healers.filter(h => h !== c),
      );
      if (biters.length > 0) fleeFrom(c, biters, matrix, 3);
      else if (medic && getRange(c, medic) > 1) travelTo(c, medic, matrix, 1);
      continue;
    }

    if (o.mode === 'evade' && !contact) {
      fleeFrom(c, armed, matrix, 10);
      continue;
    }

    if (contact && focus) {
      const near = closest(c, armed);
      // Too far back to help: close up on the group rather than walk into the
      // enemy alone, unless the enemy is already on top of us.
      if (getRange(c, anchor) > REJOIN_RANGE && (!near || getRange(c, near) > 3)) {
        travelTo(c, anchor, matrix, 2);
        continue;
      }
      // Everyone works the same target unless something is right in their face.
      const foe = near && getRange(c, near) <= 2 ? near : focus;
      // Guarding, the army fights on its own ground: it does not leave the
      // flag to go after an enemy holding position a few tiles off. Doing
      // that walked us into temik911's held block from the centre we had
      // just taken.
      //
      // Unless it is shooting us. heiseNberg.0020 and ●ω<♥♪ stand off the
      // leash and fire: our army moved one to three tiles in the 30 ticks after
      // first contact, 2 of 5 ranged and almost no melee were in reach, and our
      // melee took 2646 hits to their 777.
      if (
        o.mode === 'guard' &&
        o.target &&
        getRange(foe, o.target) > GUARD_LEASH &&
        !underFire(s)
      ) {
        if (getRange(c, o.target) > o.range) travelTo(c, o.target, matrix, o.range);
        continue;
      }
      fight(c, s, foe, meleeEnemies, matrix);
      continue;
    }

    if (!o.target) continue;
    // Taking a flag: whoever is nearest steps onto it, and everyone else keeps
    // three tiles off. Sending the anchor from the middle of the army, with
    // the rest closing to two tiles, ringed the flag with our own creeps and
    // left the army standing beside it for 800 ticks of a real game.
    if (o.mode === 'escort') {
      if (c === capturer) travelTo(c, o.target, matrix, 0);
      else travelTo(c, o.target, matrix, ESCORT_STANDOFF);
      continue;
    }
    if (c === anchor) {
      // Hold the march until stragglers close up, so the army arrives together.
      if (spread > GROUP_RADIUS + 2 && getRange(c, o.target) > o.range) continue;
      travelTo(c, o.target, matrix, o.range);
    } else if (getRange(c, anchor) > 2) {
      // Ahead of the leader, wait for it. Walking back to it and then on
      // toward the target again froze a real army for 600 ticks: half the
      // members stepped back and forth every tick, and on the ticks they
      // stood in front of the leader it could not move either.
      const ahead = getRange(c, o.target) < getRange(anchor, o.target);
      if (ahead && getRange(c, anchor) <= GROUP_RADIUS) continue;
      travelTo(c, anchor, matrix, 1);
    } else {
      travelTo(c, o.target, matrix, Math.max(o.range, 2));
    }
  }
}

/**
 * The enemy within `reach` of `from` with at least two other enemies next to
 * it and the most such neighbours, or undefined if no enemy has two.
 */
function densest(enemies: readonly Creep[], from: Creep, reach: number): Creep | undefined {
  let best: Creep | undefined;
  let most = 2;
  for (const e of enemies) {
    if (getRange(from, e) > reach) continue;
    const n = enemies.filter(o => o !== e && getRange(o, e) <= 1).length;
    if (n >= most) {
      most = n;
      best = e;
    }
  }
  return best;
}

/** The friend within `range` that most needs healing (see healNeed). */
function neediest(from: Creep, friends: readonly Creep[], range: number): Creep | undefined {
  let best: Creep | undefined;
  let bestNeed = 0;
  for (const f of friends) {
    if (getRange(from, f) > range) continue;
    const need = healNeed(f);
    if (need > bestNeed) {
      bestNeed = need;
      best = f;
    }
  }
  return best;
}

/** The member nearest the group's centre leads, so nobody gets left behind. */
function pickAnchor(army: Creep[], target: Position | undefined): Creep {
  const mid = centroid(army)!;
  let best = army[0]!;
  let bestD = Infinity;
  for (const c of army) {
    const d = getRange(c, mid) * 2 + (target ? getRange(c, target) * 0.01 : 0);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Movement once a creep is in the fight. Melee closes; anything with range and
 * no melee keeps out of reach of enemy melee and otherwise holds at three tiles;
 * pure healers keep out of melee reach and otherwise stay next to the most
 * wounded friend.
 */
function fight(c: Creep, s: State, foe: Creep, melee: Creep[], matrix: CostMatrix): void {
  const hasMelee = countParts(c, ATTACK) > 0;
  const hasRanged = countParts(c, RANGED_ATTACK) > 0;

  if (hasMelee) {
    travelTo(c, foe, matrix, 1);
    return;
  }

  const meleeClose = melee.filter(e => getRange(c, e) <= 2);
  if (meleeClose.length > 0) {
    fleeFrom(c, meleeClose, matrix, 3);
    return;
  }

  if (hasRanged) {
    // Close to a tile of the thickest enemy crowd in reach, where a mass attack
    // hits all of it at full strength, but only a crowd with no armed melee in
    // it: walking our ranged up to one cost us two of them to temik911's melee.
    const crowd = densest(
      s.enemyCreeps.filter(e => !melee.some(m => getRange(m, e) <= 2)),
      c,
      CROWD_REACH,
    );
    if (crowd) travelTo(c, crowd, matrix, 1);
    else if (getRange(c, foe) > 3) travelTo(c, foe, matrix, 3);
    return;
  }

  // Stay glued to whoever is taking damage. Hanging back out of the enemy's
  // ranged reach left our healers five tiles behind the melee line in a rated
  // loss, too far even for rangedHeal, while the enemy's healers stood two
  // tiles behind theirs.
  // With nobody hurt yet, walk in behind the front line; standing still here
  // left healers behind when the armies met.
  const patient =
    neediest(c, s.myCreeps, 8) ??
    closest(
      c,
      s.myCreeps.filter(f => f !== c && countParts(f, ATTACK) > 0),
    ) ??
    closest(
      c,
      s.myCreeps.filter(f => f !== c && !isRunner(f, s)),
    );
  if (patient && getRange(c, patient) > 1) travelTo(c, patient, matrix, 1);
}

/**
 * Every creep acts every tick, whatever it is doing with its legs. The
 * conflicts that matter (docs/api/Creep.md): `heal` cannot share a tick with
 * `attack` or `rangedHeal`; `rangedHeal` cannot share one with `attack`,
 * `rangedAttack` or `rangedMassAttack`. `heal` and `rangedAttack` can.
 */
function act(c: Creep, s: State): void {
  let attacked = false;
  let shot = false;

  const melee = meleeDamage(c);
  if (melee > 0) {
    const t = focusTarget(c, s.enemyCreeps, 1, melee);
    if (t) {
      c.attack(t);
      attacked = true;
    }
  }

  const ranged = rangedDamage(c);
  if (ranged > 0) {
    const inRange = s.enemyCreeps.filter(e => getRange(c, e) <= 3);
    if (inRange.length > 0) {
      // A mass attack hits every enemy in range, full strength at one tile.
      // Two enemies adjacent already doubles a single shot, and temik911 beat
      // us by pushing its ranged into our ranks and doing exactly that.
      const mass = inRange.reduce((sum, e) => sum + MASS_RATE[getRange(c, e)]!, 0);
      if (mass >= MASS_THRESHOLD) c.rangedMassAttack();
      else c.rangedAttack(focusTarget(c, inRange, 3, ranged)!);
      shot = true;
    }
  }

  const heal = countParts(c, HEAL) * HEAL_POWER;
  if (heal > 0 && !attacked) {
    const close = healTarget(c, s.myCreeps, 1, heal);
    if (close) c.heal(close);
    else if (!shot) {
      const far = healTarget(c, s.myCreeps, 3, heal / 3);
      if (far) c.rangedHeal(far);
    }
  }
}

export function closest<T extends Position>(from: Position, items: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = getRange(from, it);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}
