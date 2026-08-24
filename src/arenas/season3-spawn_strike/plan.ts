import { searchPath } from 'game/path-finder';
import type { CostMatrix } from 'game/path-finder';
import type { Position } from 'game/prototypes/game-object';
import type { Flag } from 'game/prototypes';
import { getRange } from 'game/utils';
import { travelMatrix, nearestRampart } from '../../lib/matrix';
import type { World } from '../../lib/world';

/**
 * Facts about this match that never change, worked out once on the first tick.
 * Positions are snapshotted rather than held as object references because the
 * structures they came from can be destroyed mid-match.
 */
export interface Plan {
  /** Our spawn's tile. Defending it is the only thing we cannot afford to lose. */
  home: Position;
  /** The enemy spawn's tile. Destroying it wins outright. */
  target: Position;
  /** Flag ids, nearest-to-us first. Runners are handed them in this order. */
  flagIds: string[];
}

/**
 * Enemies inside this range of our spawn count as a threat to the base. Shared
 * so production and tactics cannot drift apart on what "under attack" means.
 */
export const HOME_GUARD = 24;

let plan: Plan | undefined;

export function makePlan(w: World): Plan | undefined {
  if (plan) return plan;
  if (!w.mySpawn || !w.enemySpawn) return undefined;

  const home = { x: w.mySpawn.x, y: w.mySpawn.y };
  const target = { x: w.enemySpawn.x, y: w.enemySpawn.y };

  // Cheapest-first by real path cost, not straight-line range: the keep is
  // walled and the ways in are not symmetric around our base.
  const matrix = travelMatrix(w, { rampartCost: 2 });
  const ranked = w.flags
    .map(flag => ({
      flag,
      cost: searchPath(home, { pos: flag, range: 0 }, { costMatrix: matrix }).cost,
    }))
    .sort((a, b) => a.cost - b.cost);

  plan = { home, target, flagIds: ranked.map(r => String(r.flag.id)) };
  return plan;
}

export function flagById(w: World, id: string): Flag | undefined {
  return w.flags.find(f => String(f.id) === id);
}

/**
 * Where the army gathers before committing. Our own ramparts are the best real
 * estate on the map — a creep standing on one simply cannot be damaged — so we
 * mass on the near end of the rampart cross whenever we hold it.
 */
let rally: { pos: Position; ramparts: number; computedAt: number } | undefined;

/**
 * The muster point only moves when our rampart holding changes, so recomputing
 * it every tick meant building a whole CostMatrix and running A* for an answer
 * that almost never differed. The caller's matrix is reused instead of a
 * private one.
 */
const RALLY_TTL = 25;

export function rallyPoint(w: World, p: Plan, matrix: CostMatrix): Position {
  if (rally && rally.ramparts === w.myRamparts.length && w.tick - rally.computedAt < RALLY_TTL) {
    return rally.pos;
  }
  rally = { pos: computeRally(w, p, matrix), ramparts: w.myRamparts.length, computedAt: w.tick };
  return rally.pos;
}

function computeRally(w: World, p: Plan, matrix: CostMatrix): Position {
  const onRampart = nearestRampart(w, p.home);
  if (onRampart && getRange(onRampart, p.home) < getRange(p.home, p.target)) return onRampart;

  // No ramparts yet: sit a short way down the road to the enemy, clear of the
  // spawn so newly hatched creeps are not boxed in.
  const path = searchPath(p.home, { pos: p.target, range: 1 }, { costMatrix: matrix }).path;
  return path[Math.min(8, path.length - 1)] ?? p.home;
}
