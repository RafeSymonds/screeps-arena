import { ATTACK, HEAL, MOVE, RANGED_ATTACK } from 'game/constants';
import type { CostMatrix } from 'game/path-finder';
import type { Creep } from 'game/prototypes';
import type { Position } from 'game/prototypes/game-object';
import { getRange } from 'game/utils';
import { countParts, isArmed, meleeDamage } from '../../lib/body';
import { mostWounded, pickTarget } from '../../lib/combat';
import { fleeFrom, travelTo } from '../../lib/movement';
import type { FlagPlan } from './flags';
import type { State } from './state';
import { isRunner } from './state';
import { centroid } from './terrain';

/** Stronger than the enemy by this much, go and end the match by wiping them. */
const HUNT_RATIO = 1.25;
/** Weaker than this while ahead on score, stay out of their reach and run the clock. */
const EVADE_RATIO = 0.7;
/** An armed enemy this close to a creep means that creep is in the fight. */
const ENGAGE_RANGE = 5;
/** Enemies this close to an owned flag are a raid worth meeting. */
const RAID_RANGE = 7;
/** How far the leader lets the group spread before it waits. */
const GROUP_RADIUS = 5;
/**
 * Members further than this are not waited for. A creep that has lost its MOVE
 * parts or is wedged somewhere would otherwise hold the whole army in place.
 */
const STRAGGLER_RANGE = 15;

export type Mode = 'hunt' | 'escort' | 'defend' | 'guard' | 'evade' | 'cleanup';

export interface Orders {
  mode: Mode;
  target: Position | undefined;
  range: number;
}

/** RANGED_ATTACK_DISTANCE_RATE from docs/api/Constants.md, as the mass attack falloff. */
const MASS_RATE = [1, 1, 0.4, 0.1];

export function armyOf(s: State): Creep[] {
  return s.myCreeps.filter(c => !isRunner(c));
}

/**
 * Decide what the army as a whole is doing this tick. Order matters: a clear
 * strength advantage ends the match outright, so it outranks everything; flags
 * we want but cannot reach with a runner need the army to walk there; a raid
 * on a flag we hold must be met; otherwise sit between the enemy and our flags.
 */
export function orders(s: State, plan: FlagPlan, runnersAlive: number): Orders {
  const army = armyOf(s);
  const here = centroid(army);
  const enemies = s.enemyCreeps.filter(isArmed);
  const enemyCenter = centroid(enemies);
  const owned = s.flags.filter(f => f.my === true);
  const comfortablyAhead =
    s.myScore + s.myRate * s.remaining - (s.enemyScore + s.enemyRate * s.remaining) >
    Math.max(200, 2 * s.remaining);

  if (here && enemies.length > 0 && plan.ratio >= HUNT_RATIO) {
    return { mode: 'hunt', target: closest(here, enemies), range: 1 };
  }

  if (here && enemyCenter && plan.ratio < EVADE_RATIO && comfortablyAhead) {
    return { mode: 'evade', target: enemyCenter, range: 0 };
  }

  // Nothing armed left on their side, so nothing can punish a split army or a
  // debuff: every creep becomes a runner (see runners.ts).
  if (enemies.length === 0) return { mode: 'cleanup', target: undefined, range: 0 };

  const raid = enemies.find(e => owned.some(f => getRange(e, f) <= RAID_RANGE));
  if (raid) return { mode: 'defend', target: raid, range: 1 };

  const pending = s.flags.filter(f => f.my !== true && plan.wanted.has(String(f.id)));
  if (pending.length > 0 && runnersAlive === 0 && here) {
    return { mode: 'escort', target: closest(here, pending), range: 0 };
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

export function runArmy(s: State, o: Orders, matrix: CostMatrix): void {
  const army = armyOf(s);
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

  for (const c of army) {
    act(c, s);
    if (o.mode === 'cleanup') continue;

    const nearestArmed = closest(c, armed);
    const engaged = nearestArmed !== undefined && getRange(c, nearestArmed) <= ENGAGE_RANGE;

    if (o.mode === 'evade' && armed.length > 0) {
      fleeFrom(c, armed, matrix, 10);
      continue;
    }

    if (engaged && nearestArmed) {
      fight(c, s, nearestArmed, meleeEnemies, matrix);
      continue;
    }

    if (!o.target) continue;
    if (c === anchor) {
      // Hold the march until stragglers close up, so the army arrives together.
      if (spread > GROUP_RADIUS + 2 && getRange(c, o.target) > o.range) continue;
      travelTo(c, o.target, matrix, o.range);
    } else if (getRange(c, anchor) > 2) {
      travelTo(c, anchor, matrix, 1);
    } else {
      travelTo(c, o.target, matrix, Math.max(o.range, 2));
    }
  }
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
 * pure healers trail the most wounded friend while staying out of melee reach.
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
    if (getRange(c, foe) > 3) travelTo(c, foe, matrix, 3);
    return;
  }

  const patient = mostWounded(c, s.myCreeps, 6);
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

  if (countParts(c, ATTACK) > 0) {
    const t = pickTarget(c, s.enemyCreeps, 1);
    if (t) {
      c.attack(t);
      attacked = true;
    }
  }

  if (countParts(c, RANGED_ATTACK) > 0) {
    const inRange = s.enemyCreeps.filter(e => getRange(c, e) <= 3);
    if (inRange.length > 0) {
      const mass = inRange.reduce((sum, e) => sum + 10 * MASS_RATE[getRange(c, e)]!, 0);
      if (mass > 10) c.rangedMassAttack();
      else c.rangedAttack(pickTarget(c, inRange, 3)!);
      shot = true;
    }
  }

  if (countParts(c, HEAL) > 0 && !attacked) {
    const close = mostWounded(c, s.myCreeps, 1);
    if (close) c.heal(close);
    else if (!shot) {
      const far = mostWounded(c, s.myCreeps, 3);
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
