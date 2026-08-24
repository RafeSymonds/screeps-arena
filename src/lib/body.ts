import { ATTACK, CARRY, HEAL, MOVE, RANGED_ATTACK, TOUGH, WORK } from 'game/constants';
import { ATTACK_POWER, HEAL_POWER, RANGED_ATTACK_POWER } from 'game/constants';

export type BodyPart =
  | typeof ATTACK
  | typeof CARRY
  | typeof HEAL
  | typeof MOVE
  | typeof RANGED_ATTACK
  | typeof TOUGH
  | typeof WORK;

export const BODY_COST: Record<BodyPart, number> = {
  [MOVE]: 50,
  [WORK]: 100,
  [CARRY]: 50,
  [ATTACK]: 80,
  [RANGED_ATTACK]: 150,
  [HEAL]: 250,
  [TOUGH]: 10,
};

/** Anything with a `body` array — `Creep`, or the creep inside `Spawning`. */
export interface Bodied {
  body: Array<{ type: string; hits: number }>;
}

export function bodyCost(body: readonly BodyPart[]): number {
  return body.reduce((sum, part) => sum + BODY_COST[part], 0);
}

/**
 * Repeat `pattern` as many times as `energy` allows, up to `maxRepeats`.
 * Returns null when even one repetition is unaffordable.
 */
export function scaleBody(
  pattern: readonly BodyPart[],
  energy: number,
  maxRepeats = 10,
): BodyPart[] | null {
  const unit = bodyCost(pattern);
  const repeats = Math.min(maxRepeats, Math.floor(energy / unit));
  if (repeats < 1) return null;
  return Array.from({ length: repeats }, () => pattern).flat();
}

/** How many parts of a given type the creep still has alive. */
export function countParts(creep: Bodied, part: BodyPart): number {
  let n = 0;
  for (const p of creep.body) if (p.type === part && p.hits > 0) n += 1;
  return n;
}

/**
 * Damage is applied to body parts front to back, so a body is laid out
 * cheapest-and-most-expendable first: TOUGH soaks, MOVE goes next (a slow creep
 * still fights), and the parts that actually do the job sit at the back where
 * they survive longest.
 */
export function layOutBody(counts: {
  tough?: number;
  move?: number;
  ranged?: number;
  attack?: number;
  heal?: number;
}): BodyPart[] {
  const body: BodyPart[] = [];
  for (let i = 0; i < (counts.tough ?? 0); i += 1) body.push(TOUGH);
  for (let i = 0; i < (counts.move ?? 0); i += 1) body.push(MOVE);
  for (let i = 0; i < (counts.ranged ?? 0); i += 1) body.push(RANGED_ATTACK);
  for (let i = 0; i < (counts.attack ?? 0); i += 1) body.push(ATTACK);
  for (let i = 0; i < (counts.heal ?? 0); i += 1) body.push(HEAL);
  return body;
}

export function meleeDamage(creep: Bodied): number {
  return countParts(creep, ATTACK) * ATTACK_POWER;
}

export function rangedDamage(creep: Bodied): number {
  return countParts(creep, RANGED_ATTACK) * RANGED_ATTACK_POWER;
}

export function healRate(creep: Bodied): number {
  return countParts(creep, HEAL) * HEAL_POWER;
}

/** Total damage this creep can put out in a tick if everything is in range. */
export function firepower(creep: Bodied): number {
  return meleeDamage(creep) + rangedDamage(creep);
}

export function isArmed(creep: Bodied): boolean {
  return firepower(creep) > 0;
}
