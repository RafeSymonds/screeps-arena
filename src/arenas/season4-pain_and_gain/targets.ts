import { ATTACK, HEAL, RANGED_ATTACK } from 'game/constants';
import { ATTACK_POWER, BODYPART_HITS, RANGED_ATTACK_POWER } from 'game/constants';
import type { Creep } from 'game/prototypes';
import { getRange } from 'game/utils';

/**
 * Every body in this arena lists its weapons first, and damage eats parts front
 * to back. So a creep is disarmed long before it dies: a melee creep stops
 * hitting after 800 of its 1600 hits, a ranged creep or healer after 600 of
 * 1200. Damage is spent best on whoever loses the most output per point of
 * damage, and once a target has enough damage coming to disarm it this tick,
 * the next shooter picks someone else.
 */

const WEAPONS = new Set<string>([ATTACK, RANGED_ATTACK, HEAL]);

/**
 * What a HEAL part is worth next to a point of damage. Healing restores the
 * front parts first, so a healer standing behind its melee line puts weapons
 * back on disarmed creeps; that is worth more than its raw 12 hits a tick.
 */
const HEAL_PART_VALUE = 25;

/** Hits left on the parts that let a creep fight or heal. */
export function weaponHits(c: Creep): number {
  let n = 0;
  for (const p of c.body) if (WEAPONS.has(p.type)) n += p.hits;
  return n;
}

/** Damage-equivalent output per tick, from live parts only. */
export function outputOf(c: Creep): number {
  let n = 0;
  for (const p of c.body) {
    if (p.hits <= 0) continue;
    if (p.type === ATTACK) n += ATTACK_POWER;
    else if (p.type === RANGED_ATTACK) n += RANGED_ATTACK_POWER;
    else if (p.type === HEAL) n += HEAL_PART_VALUE;
  }
  return n;
}

/** True for creeps built without any weapon or HEAL part: the scouts. */
export function bornUnarmed(c: Creep): boolean {
  return !c.body.some(p => WEAPONS.has(p.type));
}

/** True for a creep that was built to fight or heal and has lost every such part. */
export function disarmed(c: Creep): boolean {
  return !bornUnarmed(c) && outputOf(c) === 0;
}

/** Damage already committed to each enemy this tick. Reset by `newTick`. */
const planned = new Map<Creep, number>();
/** Healing already committed to each friend this tick. */
const mending = new Map<Creep, number>();

export function newTick(): void {
  planned.clear();
  mending.clear();
}

/**
 * The enemy within `range` that loses the most output per point of damage,
 * skipping any that are already going to be disarmed this tick unless nothing
 * else is in reach. Records `damage` against the choice.
 */
export function focusTarget(
  from: Creep,
  enemies: readonly Creep[],
  range: number,
  damage: number,
): Creep | undefined {
  let best: Creep | undefined;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (getRange(from, e) > range) continue;
    const already = planned.get(e) ?? 0;
    const toDisarm = weaponHits(e) - already;
    const toKill = e.hits - already;
    let score: number;
    if (toKill <= damage)
      score = 1000 + outputOf(e); // a kill this tick
    else if (toDisarm > 0) score = outputOf(e) / toDisarm;
    // Disarmed or about to be: still worth finishing, after everything else.
    else score = -toKill / 10000;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) planned.set(best, (planned.get(best) ?? 0) + damage);
  return best;
}

/**
 * How much a friend needs healing. Missing hits on weapon parts count double:
 * each part restored is output back.
 */
export function healNeed(f: Creep): number {
  const missing = f.hitsMax - f.hits;
  if (missing <= 0) return 0;
  let weaponMissing = 0;
  for (const p of f.body) if (WEAPONS.has(p.type)) weaponMissing += BODYPART_HITS - p.hits;
  return missing + weaponMissing;
}

/**
 * The friend within `range` whose healing buys back the most fighting. Every
 * healer converges on the same friend until it would be overhealed: in real
 * games the side whose three healers worked one creep together kept it armed,
 * and the side that spread its healing lost every creep it was spread across.
 */
export function healTarget(
  from: Creep,
  friends: readonly Creep[],
  range: number,
  heal: number,
): Creep | undefined {
  let best: Creep | undefined;
  let bestScore = 0;
  for (const f of friends) {
    if (getRange(from, f) > range) continue;
    if (f.hitsMax - f.hits - (mending.get(f) ?? 0) <= 0) continue;
    const score = healNeed(f);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (best) mending.set(best, (mending.get(best) ?? 0) + heal);
  return best;
}
