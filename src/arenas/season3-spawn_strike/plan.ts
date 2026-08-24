import { searchPath } from 'game/path-finder';
import type { Position } from 'game/prototypes/game-object';
import type { Flag } from 'game/prototypes';
import { travelMatrix } from '../../lib/matrix';
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
  /**
   * How much longer the real road between the two bases is than the straight
   * line. The terrain is a maze, so straight-line range understates travel time
   * by about half; multiplying by this turns a cheap `getRange` into a usable
   * arrival estimate without a pathfinder call per creep per tick.
   */
  detour: number;
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
      // Runners are pure MOVE, so swamp costs them no more than plains.
      cost: searchPath(home, { pos: flag, range: 0 }, { costMatrix: matrix, swampCost: 2 }).cost,
    }))
    .sort((a, b) => a.cost - b.cost);

  const road = searchPath(home, { pos: target, range: 1 }, { costMatrix: matrix }).path.length;
  const direct = Math.max(1, Math.max(Math.abs(home.x - target.x), Math.abs(home.y - target.y)));

  plan = {
    home,
    target,
    flagIds: ranked.map(r => String(r.flag.id)),
    detour: Math.max(1, road / direct),
  };
  return plan;
}

export function flagById(w: World, id: string): Flag | undefined {
  return w.flags.find(f => String(f.id) === id);
}

/**
 * Where the army gathers before committing: just outside our own spawn, facing
 * the way we will eventually leave. It sits this close deliberately. Mustering
 * further forward looks more aggressive but only guards the one route we happen
 * to favour, and an attacker that comes round another way walks straight past
 * it into an empty base.
 *
 * It is also deliberately *not* the central rampart cross. That looks like a
 * covered highway on the map, but the terrain between our base and the near end
 * of it is a maze: going that way is half again as long as heading straight at
 * the enemy.
 */
let muster: { tick: number; pos: Position } | undefined;
const MUSTER_STEPS = 5;
/** The muster point drifts only as obstacles do, so it does not need recomputing often. */
const MUSTER_TTL = 25;

export function musterPoint(w: World, p: Plan): Position {
  if (muster && w.tick - muster.tick < MUSTER_TTL) return muster.pos;
  const matrix = travelMatrix(w, { rampartCost: 2 });
  const path = searchPath(p.home, { pos: p.target, range: 1 }, { costMatrix: matrix }).path;
  muster = { tick: w.tick, pos: path[Math.min(MUSTER_STEPS, path.length - 1)] ?? p.home };
  return muster.pos;
}
