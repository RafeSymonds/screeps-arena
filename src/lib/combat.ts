import { ATTACK, HEAL, RANGED_ATTACK } from 'game/constants';
import type { Creep, Structure } from 'game/prototypes';
import { getRange } from 'game/utils';
import { countParts, firepower, healRate } from './body';

/**
 * Focus fire in the order that shrinks the enemy's output fastest: healers keep
 * everything else alive, ranged units are the ones that hurt us from safety,
 * and a nearly-dead creep is worth finishing so its whole body stops counting.
 */
function threatScore(creep: Creep): number {
  let score = 0;
  score += countParts(creep, HEAL) * 40;
  score += countParts(creep, RANGED_ATTACK) * 12;
  score += countParts(creep, ATTACK) * 8;
  // Prefer whatever dies soonest among otherwise similar targets. This has to
  // be damage *taken*: hitsMax is 100 per body part, so scoring against a fixed
  // ceiling would rank a healthy 1-part runner as the most nearly-dead thing on
  // the map and pull the whole army onto it.
  score += (creep.hitsMax - creep.hits) / 100;
  return score;
}

export function pickTarget(from: Creep, enemies: Creep[], range: number): Creep | undefined {
  let best: Creep | undefined;
  let bestScore = -Infinity;
  for (const enemy of enemies) {
    if (getRange(from, enemy) > range) continue;
    const score = threatScore(enemy);
    if (score > bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

/** The friendly that has lost the most hit points, within `range`. */
export function mostWounded(from: Creep, friends: Creep[], range: number): Creep | undefined {
  let best: Creep | undefined;
  let bestMissing = 0;
  for (const friend of friends) {
    const missing = friend.hitsMax - friend.hits;
    if (missing <= 0) continue;
    if (getRange(from, friend) > range) continue;
    if (missing > bestMissing) {
      bestMissing = missing;
      best = friend;
    }
  }
  return best;
}

export function totalFirepower(creeps: Creep[]): number {
  return creeps.reduce((sum, c) => sum + firepower(c), 0);
}

export function totalHealing(creeps: Creep[]): number {
  return creeps.reduce((sum, c) => sum + healRate(c), 0);
}

export function hitsOf(structure: Structure | undefined): number {
  return structure?.hits ?? 0;
}
