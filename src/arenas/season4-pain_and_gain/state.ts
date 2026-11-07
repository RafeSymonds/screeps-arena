import { ATTACK, HEAL, RANGED_ATTACK } from 'game/constants';
import { Creep } from 'game/prototypes';
import { getObjectsByPrototype, getTicks } from 'game/utils';
import { arenaInfo } from 'game';
import { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';
import { countParts } from '../../lib/body';

/** The whole match budget. Read from the sandbox, with the documented value as fallback. */
export const TICKS_LIMIT = arenaInfo.ticksLimit || 2000;

export interface State {
  tick: number;
  remaining: number;
  myCreeps: Creep[];
  enemyCreeps: Creep[];
  flags: ScoreFlag[];
  myIds: Set<string>;
  /** Our running score as counted from flag ownership. The sandbox exposes no score. */
  myScore: number;
  enemyScore: number;
  myRate: number;
  enemyRate: number;
}

/**
 * The arena does not expose the score, so it is counted here from who owns each
 * flag every tick. It can be a tick off around a capture; the decisions that use
 * it work on margins of hundreds of points.
 */
let myScore = 0;
let enemyScore = 0;
let cache: State | undefined;

export function state(): State {
  const tick = getTicks();
  if (cache && cache.tick === tick) return cache;

  const creeps = getObjectsByPrototype(Creep);
  const flags = getObjectsByPrototype(ScoreFlag);
  const myCreeps = creeps.filter(c => c.my);
  const enemyCreeps = creeps.filter(c => c.my === false);

  let myRate = 0;
  let enemyRate = 0;
  for (const f of flags) {
    if (f.my === true) myRate += f.scorePerTick;
    else if (f.my === false) enemyRate += f.scorePerTick;
  }
  myScore += myRate;
  enemyScore += enemyRate;

  cache = {
    tick,
    remaining: Math.max(0, TICKS_LIMIT - tick),
    myCreeps,
    enemyCreeps,
    flags,
    myIds: new Set(myCreeps.map(c => String(c.id))),
    myScore,
    enemyScore,
    myRate,
    enemyRate,
  };
  return cache;
}

/** A creep with nothing to fight or heal with. These capture flags. */
export function isRunner(c: Creep): boolean {
  return countParts(c, ATTACK) + countParts(c, RANGED_ATTACK) + countParts(c, HEAL) === 0;
}
