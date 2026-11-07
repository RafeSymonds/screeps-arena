import {
  ATTACK,
  EFF_ATTACK_MODIFIER,
  EFF_DAMAGE_TAKEN_MODIFIER,
  EFF_HEAL_MODIFIER,
  EFF_RANGED_ATTACK_MODIFIER,
  HEAL,
  RANGED_ATTACK,
} from 'game/constants';
import { ATTACK_POWER, HEAL_POWER, RANGED_ATTACK_POWER } from 'game/constants';
import type { Creep } from 'game/prototypes';
import type { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';
import { countParts } from '../../lib/body';
import type { State } from './state';

/**
 * Multiplier for 0, 1, 2 flags of a type, from the arena description and
 * docs/api/Modifier_effects.md. Same-type flags combine through a table, not by
 * multiplying, so this is a lookup rather than `base ** count`.
 */
const STACKING: Record<string, readonly number[]> = {
  [EFF_ATTACK_MODIFIER]: [1, 0.8, 0.6],
  [EFF_RANGED_ATTACK_MODIFIER]: [1, 0.8, 0.6],
  [EFF_HEAL_MODIFIER]: [1, 0.75, 0.5],
  [EFF_DAMAGE_TAKEN_MODIFIER]: [1, 1.1],
};

export interface Mults {
  attack: number;
  ranged: number;
  heal: number;
  damageTaken: number;
}

function stacked(effect: string, count: number): number {
  const table = STACKING[effect];
  if (!table) return 1;
  return table[Math.min(count, table.length - 1)]!;
}

export function multsFor(flags: readonly ScoreFlag[]): Mults {
  const n: Record<string, number> = {};
  for (const f of flags) n[f.effectType] = (n[f.effectType] ?? 0) + 1;
  return {
    attack: stacked(EFF_ATTACK_MODIFIER, n[EFF_ATTACK_MODIFIER] ?? 0),
    ranged: stacked(EFF_RANGED_ATTACK_MODIFIER, n[EFF_RANGED_ATTACK_MODIFIER] ?? 0),
    heal: stacked(EFF_HEAL_MODIFIER, n[EFF_HEAL_MODIFIER] ?? 0),
    damageTaken: stacked(EFF_DAMAGE_TAKEN_MODIFIER, n[EFF_DAMAGE_TAKEN_MODIFIER] ?? 0),
  };
}

/**
 * Ticks of healing credited as extra hit points. A fight between two 14-creep
 * armies lasts a few dozen ticks, and healing over that span is worth about
 * this much armour.
 */
const HEAL_HORIZON = 25;

/**
 * Lanchester-style fighting strength: damage output times how much damage the
 * army can soak. Comparing two of these is the useful part; the absolute number
 * means nothing.
 */
export function strength(creeps: readonly Creep[], m: Mults): number {
  let offense = 0;
  let heal = 0;
  let hits = 0;
  for (const c of creeps) {
    offense += countParts(c, ATTACK) * ATTACK_POWER * m.attack;
    offense += countParts(c, RANGED_ATTACK) * RANGED_ATTACK_POWER * m.ranged;
    heal += countParts(c, HEAL) * HEAL_POWER * m.heal;
    hits += c.hits;
  }
  return (offense * (hits + HEAL_HORIZON * heal)) / m.damageTaken;
}

/**
 * We accept being at most this much weaker than the enemy to hold more flags.
 * Rated games are mostly decided by one army-on-army fight, so this is tight:
 * it allows one ranged-reduction flag (ranged is under a quarter of our
 * damage) but not vulnerability, whose ×1.1 damage taken lost us fights.
 *
 * Holding the ranged flag is also bait. Against Odiodin, in every game where
 * we sat on it they came out and took three flags themselves, which weakened
 * them enough for us to hunt them down. In every game where we held none,
 * they attacked at full strength and won.
 */
const MIN_RATIO = 0.95;
/**
 * In the closing stretch a debuff has less time to cost us a fight. Not much
 * less, though: a wipe in the last 200 ticks still loses the match.
 */
const LATE_MIN_RATIO = 0.8;
const LATE_FRACTION = 0.1;
/**
 * Before this tick a losing score is not worth weakening the army over: the
 * opponent may still come to fight, and most of the match is left to answer.
 */
const PATIENCE = 500;
/** How much weaker we will go to turn a losing score into a winning one. */
const RISKY_MIN_RATIO = 0.8;

export interface FlagPlan {
  /** Flags we want to own. Includes the ones we already do. */
  wanted: Set<string>;
  /** Our strength over theirs, as things stand right now. */
  ratio: number;
  /** Projected final score margin if `wanted` is achieved and nothing else changes. */
  margin: number;
}

/**
 * Pick the set of flags to hold. Every subset of the flags we do not own is
 * scored (seven flags, so at most 128), on two numbers: the final score margin
 * if we took them and the enemy kept the rest of theirs, and our fighting
 * strength against theirs once both sides' debuffs are applied.
 *
 * Among the sets that are both safe enough (ratio at least `MIN_RATIO`) and
 * winning by a comfortable buffer, prefer the strongest one — taking more flags
 * than needed to win only weakens the army. Between equally strong sets (a flag
 * whose debuff hits a part we do not have, or an enemy with no weapons left),
 * take the one that scores more. If nothing safe wins, take the
 * safe set with the best margin. If nothing is safe at all, take nothing more.
 *
 * Owned flags cannot be given up, so they are always in the set.
 */
export function planFlags(s: State, total: number): FlagPlan {
  const owned = s.flags.filter(f => f.my === true);
  const theirs = s.flags.filter(f => f.my === false);
  // A creep standing on a flag blocks anyone else from stepping onto it, and
  // both sides park scouts on the flags they hold. Counting such a flag as
  // takeable sent our scouts to stand next to it for the rest of the match
  // while the plan believed it was winning.
  const open = s.flags.filter(
    f => f.my !== true && !s.enemyCreeps.some(c => c.x === f.x && c.y === f.y),
  );

  const minRatio = s.remaining < total * LATE_FRACTION ? LATE_MIN_RATIO : MIN_RATIO;
  // Assume the enemy can still pick up roughly one more mid-value flag for
  // half of what remains. Re-planned every tick, so this only needs to be rough.
  const buffer = Math.max(200, 4 * s.remaining);

  const enemyNow = strength(s.enemyCreeps, multsFor(theirs));
  const ratioOf = (mine: ScoreFlag[], kept: ScoreFlag[]): number => {
    const ours = strength(s.myCreeps, multsFor(mine));
    const them = strength(s.enemyCreeps, multsFor(kept));
    return them > 0 ? ours / them : Infinity;
  };

  let bestWin: { set: ScoreFlag[]; ratio: number; margin: number } | undefined;
  let bestSafe: { set: ScoreFlag[]; ratio: number; margin: number } | undefined;
  let bestRisky: { set: ScoreFlag[]; ratio: number; margin: number } | undefined;

  for (let mask = 0; mask < 1 << open.length; mask += 1) {
    const take = open.filter((_, i) => mask & (1 << i));
    const mine = owned.concat(take);
    const kept = theirs.filter(f => !take.includes(f));
    const rate = mine.reduce((a, f) => a + f.scorePerTick, 0);
    const enemyRate = kept.reduce((a, f) => a + f.scorePerTick, 0);
    const margin = s.myScore + rate * s.remaining - (s.enemyScore + enemyRate * s.remaining);
    const ratio = ratioOf(mine, kept);
    if (margin > 0 && ratio >= RISKY_MIN_RATIO && (!bestRisky || ratio > bestRisky.ratio)) {
      bestRisky = { set: mine, ratio, margin };
    }
    if (ratio < minRatio && mask !== 0) continue;

    const option = { set: mine, ratio, margin };
    if (margin > buffer) {
      if (
        !bestWin ||
        ratio > bestWin.ratio ||
        (ratio === bestWin.ratio && margin > bestWin.margin)
      ) {
        bestWin = option;
      }
    }
    if (!bestSafe || margin > bestSafe.margin) bestSafe = option;
  }

  // Nothing safe wins on score. A sure loss on the clock is worse than a
  // weaker army, so once the opening is over take the strongest set that wins.
  // Two identical bots in a real game sat at 7 a tick each for 1900 ticks and
  // the one that had captured first won by 291.
  const losing = !bestWin && bestSafe!.margin <= 0;
  const pick = bestWin ?? (losing && s.tick >= PATIENCE && bestRisky ? bestRisky : bestSafe!);
  const ours = strength(s.myCreeps, multsFor(owned));
  return {
    wanted: new Set(pick.set.map(f => String(f.id))),
    ratio: enemyNow > 0 ? ours / enemyNow : Infinity,
    margin: pick.margin,
  };
}
