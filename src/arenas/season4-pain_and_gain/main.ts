import { pruneTrips } from '../../lib/movement';
import { orders, runArmy } from './army';
import type { FlagPlan } from './flags';
import { planFlags } from './flags';
import { reportArena, reportProgress } from './recon';
import { runRunners, runnersOf } from './runners';
import { state, TICKS_LIMIT } from './state';
import { buildMatrix } from './terrain';

/**
 * Season 4 Pain and Gain (basic). Each side gets a fixed army of 14 creeps: no
 * spawning, energy or replacements. Seven neutral ScoreFlags are captured by
 * standing on them and then score every tick for their owner, but each one
 * also debuffs the owner's whole army (attack, ranged, heal, or damage taken).
 * Highest score at tick 2000 wins, and wiping out the enemy army wins outright.
 *
 * So every flag is a trade of points for fighting strength. The plan
 * (flags.ts) picks the set of flags that wins on score while keeping the army
 * strong enough not to be wiped; creeps with no weapons go and take them
 * (runners.ts); the army hunts when it is clearly stronger, meets raids on
 * our flags, and otherwise guards the most exposed one (army.ts).
 */

const REPORT_EVERY = 100;
/** Re-plan at least this often even if no flag changed hands. */
const REPLAN_EVERY = 10;

let plan: FlagPlan | undefined;
let planKey = '';
let plannedAt = -Infinity;

export function loop(): void {
  const s = state();
  if (s.tick === 1) reportArena(s);

  pruneTrips(s.myIds);

  // Re-planning every tick lets the wanted set flicker as hit points change,
  // which sends runners back and forth. Hold it until something real happens.
  const key = s.flags.map(f => String(f.my)).join(',');
  if (!plan || key !== planKey || s.tick - plannedAt >= REPLAN_EVERY) {
    plan = planFlags(s, TICKS_LIMIT);
    planKey = key;
    plannedAt = s.tick;
  }

  const o = orders(s, plan, runnersOf(s).length);

  // Anything not in the plan is a flag nobody should blunder onto, except the
  // one the army has been sent to take.
  const avoid = s.flags.filter(f => !plan!.wanted.has(String(f.id)) && f !== o.target);
  const matrix = buildMatrix(s, { avoid });
  const runnerMatrix = buildMatrix(s, { avoid, dangerCost: 20, dangerRange: 4 });
  const cleanup = o.mode === 'cleanup';
  runRunners(s, plan, runnerMatrix, cleanup ? s.myCreeps : runnersOf(s), cleanup);
  runArmy(s, o, matrix);

  if (s.tick % REPORT_EVERY === 0) reportProgress(s, plan, o);
}
