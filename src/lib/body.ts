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

/** How many parts of a given type the creep still has alive. */
export function countParts(creep: Bodied, part: BodyPart): number {
  let n = 0;
  for (const p of creep.body) if (p.type === part && p.hits > 0) n += 1;
  return n;
}

/**
 * Damage is applied to body parts front to back, so the order of a body decides
 * how it degrades. TOUGH goes first because it is pure filler at 10 energy per
 * 100 hits. Everything after it is *interleaved* rather than blocked: a body
 * laid out `MOVE MOVE MOVE ATTACK ATTACK ATTACK` loses every MOVE part before
 * the first ATTACK part, which leaves a creep that is permanently fatigued,
 * cannot reach anything, and is worth nothing for the rest of the match.
 * Interleaving keeps the MOVE-to-work ratio — and therefore the creep's speed —
 * roughly constant as it is chewed down.
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

  const work: BodyPart[] = [];
  for (let i = 0; i < (counts.ranged ?? 0); i += 1) work.push(RANGED_ATTACK);
  for (let i = 0; i < (counts.attack ?? 0); i += 1) work.push(ATTACK);
  for (let i = 0; i < (counts.heal ?? 0); i += 1) work.push(HEAL);

  const moves = counts.move ?? 0;
  let placed = 0;
  let taken = 0;
  while (placed < moves || taken < work.length) {
    const moveIsBehind = placed * work.length <= taken * moves;
    if (placed < moves && (taken >= work.length || moveIsBehind)) {
      body.push(MOVE);
      placed += 1;
    } else {
      body.push(work[taken]!);
      taken += 1;
    }
  }
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

/**
 * What a tile actually costs this creep in ticks, expressed as pathfinder
 * costs. Fatigue is `terrainCost * non-MOVE parts` and each MOVE part clears 2
 * per tick, so a creep carrying five MOVE per working part crosses swamp at
 * full speed — and must not be sent on the long way round to avoid it.
 */
export function moveCosts(creep: Bodied): { plainCost: number; swampCost: number } {
  const move = countParts(creep, MOVE);
  const load = creep.body.filter(p => p.hits > 0 && p.type !== MOVE).length;
  if (load === 0) return { plainCost: 2, swampCost: 2 };
  if (move === 0) return { plainCost: 2, swampCost: 10 };
  const plainTicks = Math.max(1, Math.ceil((2 * load) / (2 * move)));
  const swampTicks = Math.max(1, Math.ceil((10 * load) / (2 * move)));
  return { plainCost: 2, swampCost: Math.max(2, Math.round((2 * swampTicks) / plainTicks)) };
}
