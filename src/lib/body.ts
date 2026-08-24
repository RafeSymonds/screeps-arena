import { ATTACK, CARRY, HEAL, MOVE, RANGED_ATTACK, TOUGH, WORK } from 'game/constants';

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
export function countParts(creep: { body: Array<{ type: string; hits: number }> }, part: BodyPart) {
  return creep.body.filter(p => p.type === part && p.hits > 0).length;
}
