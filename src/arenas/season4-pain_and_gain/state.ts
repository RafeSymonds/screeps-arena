import { Creep } from 'game/prototypes';
import { EFF_DAMAGE_TAKEN_MODIFIER } from 'game/constants';
import { getObjectsByPrototype, getRange, getTicks } from 'game/utils';
import { isArmed } from '../../lib/body';
import { arenaInfo } from 'game';
import { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';
import { bornUnarmed } from './targets';

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
  /**
   * Whether the enemy is contesting the centre: true once its army comes
   * within CONTEST_RANGE of the centre flag before CONTEST_DEADLINE, false if
   * it has not by then, undefined until one or the other. Sticky for the match.
   *
   * The two strongest opponents need opposite answers. temik911 races its army
   * to the centre and holds it, and we only beat it by holding the centre
   * first. Odiodin waits at home and attacks whoever holds the centre, and we
   * only beat it by leaving the centre alone and sitting on a far flag.
   */
  centreContest: boolean | undefined;
}

const CONTEST_RANGE = 15;
const CONTEST_DEADLINE = 120;
let centreContest: boolean | undefined;

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

  if (centreContest === undefined) {
    const centre = flags.find(f => f.effectType === EFF_DAMAGE_TAKEN_MODIFIER);
    const armed = enemyCreeps.filter(isArmed);
    const near =
      centre !== undefined && armed.filter(c => getRange(c, centre) <= CONTEST_RANGE).length;
    if (near && near >= armed.length / 2) centreContest = true;
    else if (tick >= CONTEST_DEADLINE) centreContest = false;
  }

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
    centreContest,
  };
  return cache;
}

/**
 * A creep built with nothing to fight or heal with: the scouts. These capture
 * flags. A fighter that has lost its weapons is not one; it stays with the army
 * to be healed back into the fight.
 */
export function isRunner(c: Creep): boolean {
  return bornUnarmed(c);
}
