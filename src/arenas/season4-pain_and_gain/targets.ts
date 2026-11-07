import { ATTACK, HEAL, RANGED_ATTACK } from 'game/constants';
import { ATTACK_POWER, BODYPART_HITS, RANGED_ATTACK_POWER } from 'game/constants';
import type { Creep } from 'game/prototypes';
import { getRange } from 'game/utils';

/**
 * Every body in this arena lists its weapons first, and damage eats parts front
 * to back. So a creep is disarmed long before it dies: a melee creep stops
 * hitting after 800 of its 1600 hits, a ranged creep or healer after 600 of
 * 1200.
 */

const WEAPONS = new Set<string>([ATTACK, RANGED_ATTACK, HEAL]);

/**
 * What a HEAL part is worth next to a point of damage. Healing restores the
 * front parts first, so a healer standing behind its melee line puts weapons
 * back on disarmed creeps; that is worth more than its raw 12 hits a tick.
 */
const HEAL_PART_VALUE = 25;

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
/** Damage our whole army could put on each enemy this tick, from where it stands. */
const reach = new Map<Creep, number>();

/**
 * Damage committed past a target's hits before the next shooter moves on.
 * Enemy healers land in the same tick, so a little overkill is insurance.
 */
const OVERKILL = 150;

export function newTick(army: readonly Creep[], enemies: readonly Creep[]): void {
  planned.clear();
  mending.clear();
  reach.clear();
  for (const e of enemies) {
    let total = 0;
    for (const c of army) {
      const d = getRange(c, e);
      for (const p of c.body) {
        if (p.hits <= 0) continue;
        if (p.type === ATTACK && d <= 1) total += ATTACK_POWER;
        else if (p.type === RANGED_ATTACK && d <= 3) total += RANGED_ATTACK_POWER;
      }
    }
    reach.set(e, total);
  }
}

/**
 * Where this creep's damage goes. The whole army converges on one enemy: the
 * one whose output we can delete fastest, given how much of our army can
 * reach it this tick. Spreading damage to disarm several creeps at once lost
 * real games: enemy healers undid it, while the opponent that put all nine
 * of its weapons on one creep a tick killed one of ours every few ticks.
 * Records `damage` against the choice, and moves on once a target has enough
 * coming to die. Always returns a target when any enemy is in range.
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
    const left = e.hits - (planned.get(e) ?? 0);
    // Fraction of the target our army can remove this tick, times what it is
    // worth. Unarmed creeps still count a little, so stragglers get finished.
    const share = Math.min(1, (reach.get(e) ?? damage) / Math.max(1, left));
    // Already dead with margin to spare: only if nothing else is in reach.
    const score = left < -OVERKILL ? -1 : (outputOf(e) + 10) * share;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) planned.set(best, (planned.get(best) ?? 0) + damage);
  return best;
}

/**
 * Damage the enemy can land on `f` next tick: melee within 2 (a step and a
 * swing), ranged within 4 (a step and a shot).
 */
export function incoming(f: Creep, enemies: readonly Creep[]): number {
  let n = 0;
  for (const e of enemies) {
    const d = getRange(f, e);
    for (const p of e.body) {
      if (p.hits <= 0) continue;
      if (p.type === ATTACK && d <= 2) n += ATTACK_POWER;
      else if (p.type === RANGED_ATTACK && d <= 4) n += RANGED_ATTACK_POWER;
    }
  }
  return n;
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
  enemies: readonly Creep[],
): Creep | undefined {
  let best: Creep | undefined;
  let bestScore = 0;
  for (const f of friends) {
    if (getRange(from, f) > range) continue;
    // Damage and healing in one tick net out, so a heal on a creep about to
    // be hit is worth as much as one after, and keeps its weapon parts up
    // through the hit. The strongest players spend more than half their heals
    // on creeps at full health; we healed only what was already hurt.
    const due = incoming(f, enemies);
    if (f.hitsMax - f.hits + due - (mending.get(f) ?? 0) <= 0) continue;
    const score = healNeed(f) + due;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (best) mending.set(best, (mending.get(best) ?? 0) + heal);
  return best;
}
