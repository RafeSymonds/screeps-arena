import type { CostMatrix } from 'game/path-finder';
import type { Creep } from 'game/prototypes';
import type { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';
import { getRange } from 'game/utils';
import { isArmed } from '../../lib/body';
import { fleeFrom, travelTo } from '../../lib/movement';
import type { FlagPlan } from './flags';
import type { State } from './state';
import { isRunner } from './state';

/** A moving runner keeps at least this far from anything armed. */
const RUNNER_SAFE = 4;
/** A runner parked on a flag holds it until it drops below this fraction of its hits. */
const HOLD_UNTIL = 0.5;

export function runnersOf(s: State): Creep[] {
  return s.myCreeps.filter(isRunner);
}

/**
 * Creeps with nothing to fight with take flags. Each wanted flag we do not own
 * goes to the nearest free runner. A runner with no flag to take parks on an
 * owned flag no friend is standing on: the enemy cannot step onto an occupied
 * tile, so they have to kill it before they can take the flag back.
 *
 * Once the enemy has nothing armed left, the whole army is passed in here, and
 * creeps with no flag to take hunt down the stragglers instead: killing the
 * last of them ends the match.
 */
export function runRunners(
  s: State,
  plan: FlagPlan,
  matrix: CostMatrix,
  runners: Creep[],
  huntWhenIdle: boolean,
): void {
  if (runners.length === 0) return;
  const armed = s.enemyCreeps.filter(isArmed);

  const free = new Set(runners);
  const jobs = new Map<Creep, ScoreFlag>();
  const pending = s.flags.filter(f => f.my !== true && plan.wanted.has(String(f.id)));
  // Shortest assignments first, so two runners do not swap targets across the map.
  const pairs: Array<{ r: Creep; f: ScoreFlag; d: number }> = [];
  for (const r of runners) for (const f of pending) pairs.push({ r, f, d: getRange(r, f) });
  pairs.sort((a, b) => a.d - b.d);
  const taken = new Set<ScoreFlag>();
  for (const { r, f } of pairs) {
    if (!free.has(r) || taken.has(f)) continue;
    jobs.set(r, f);
    free.delete(r);
    taken.add(f);
  }

  const guarded = new Set(
    s.flags.filter(f => s.myCreeps.some(c => c.x === f.x && c.y === f.y)).map(f => String(f.id)),
  );

  for (const r of runners) {
    const threats = armed.filter(e => getRange(r, e) <= RUNNER_SAFE);
    const flagUnder = s.flags.find(f => f.x === r.x && f.y === r.y && f.my === true);
    const job = jobs.get(r);

    if (flagUnder && !job) {
      if (threats.length > 0 && r.hits < r.hitsMax * HOLD_UNTIL) fleeFrom(r, threats, matrix, 6);
      continue;
    }
    if (threats.length > 0 && (!job || getRange(r, job) > 1)) {
      fleeFrom(r, threats, matrix, RUNNER_SAFE + 2);
      continue;
    }
    if (job) {
      travelTo(r, job, matrix, 0);
      continue;
    }

    if (huntWhenIdle) {
      const prey = s.enemyCreeps.slice().sort((a, b) => getRange(r, a) - getRange(r, b))[0];
      if (prey) {
        travelTo(r, prey, matrix, 1);
        continue;
      }
    }

    const post = s.flags
      .filter(f => f.my === true && !guarded.has(String(f.id)))
      .sort((a, b) => getRange(r, a) - getRange(r, b))[0];
    if (post) {
      guarded.add(String(post.id));
      travelTo(r, post, matrix, 0);
    }
  }
}
