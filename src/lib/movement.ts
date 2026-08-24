import type { CostMatrix } from 'game/path-finder';
import { searchPath } from 'game/path-finder';
import type { Position } from 'game/prototypes/game-object';
import type { Creep } from 'game/prototypes';
import { getDirection, getRange, getTicks } from 'game/utils';

/**
 * `moveTo` re-runs A* from scratch on every call, which is wasteful on a 100x100
 * map with a 200-tile march. Paths are cached per creep and recomputed only when
 * they go stale: the goal moved, the path ran out, or the creep is wedged.
 */
interface Trip {
  path: Position[];
  goalX: number;
  goalY: number;
  goalRange: number;
  computedAt: number;
  incomplete: boolean;
}

const trips = new Map<string, Trip>();
/** Ticks a creep has spent unable to move, tracked across path recomputes. */
const stalled = new Map<string, { x: number; y: number; ticks: number }>();

/** Recompute at least this often even when nothing looks wrong. */
const MAX_PATH_AGE = 12;
/** Ticks of standing still, while able to move, before we call it wedged. */
const STUCK_LIMIT = 2;

export interface TravelResult {
  /** False when the pathfinder could not reach the goal at all. */
  reachable: boolean;
  /** True while the creep has been unable to make progress for several ticks. */
  wedged: boolean;
}

export function travelTo(
  creep: Creep,
  goal: Position,
  matrix: CostMatrix,
  range = 0,
): TravelResult {
  const key = String(creep.id);
  const wedged = trackProgress(key, creep) >= STUCK_LIMIT;

  let trip = trips.get(key);
  if (trip && isStale(trip, goal, range, wedged)) trip = undefined;

  if (!trip) {
    const result = searchPath(creep, { pos: goal, range }, { costMatrix: matrix, maxOps: 20000 });
    trip = {
      path: result.path,
      goalX: goal.x,
      goalY: goal.y,
      goalRange: range,
      computedAt: getTicks(),
      incomplete: result.incomplete,
    };
    trips.set(key, trip);
  }

  // Drop steps already behind us: a creep can be shoved, or skip one.
  while (trip.path.length > 0 && getRange(creep, trip.path[0]!) === 0) trip.path.shift();

  const step = trip.path[0];
  if (!step) return { reachable: !trip.incomplete, wedged };
  if (getRange(creep, step) > 1) {
    // We are off the cached path entirely; force a fresh search next tick.
    trips.delete(key);
    return { reachable: !trip.incomplete, wedged };
  }

  creep.move(getDirection(step.x - creep.x, step.y - creep.y));
  return { reachable: !trip.incomplete, wedged };
}

/** Returns how many consecutive ticks this creep has failed to move. */
function trackProgress(key: string, creep: Creep): number {
  const seen = stalled.get(key);
  if (!seen || seen.x !== creep.x || seen.y !== creep.y || creep.fatigue > 0) {
    stalled.set(key, { x: creep.x, y: creep.y, ticks: 0 });
    return 0;
  }
  seen.ticks += 1;
  return seen.ticks;
}

function isStale(trip: Trip, goal: Position, range: number, wedged: boolean): boolean {
  return (
    wedged ||
    trip.path.length === 0 ||
    trip.goalRange !== range ||
    getTicks() - trip.computedAt > MAX_PATH_AGE ||
    getRange({ x: trip.goalX, y: trip.goalY }, goal) > 1
  );
}

/** Walk away from a set of threats. Used to pull a damaged raider back out. */
export function fleeFrom(creep: Creep, threats: Position[], matrix: CostMatrix, range = 8): void {
  if (threats.length === 0) return;
  trips.delete(String(creep.id));
  const result = searchPath(
    creep,
    threats.map(t => ({ pos: t, range })),
    { costMatrix: matrix, flee: true, maxOps: 6000 },
  );
  const step = result.path[0];
  if (step) creep.move(getDirection(step.x - creep.x, step.y - creep.y));
}

/** Cached state is keyed by creep id; drop whatever belongs to a dead creep. */
export function pruneTrips(aliveIds: Set<string>): void {
  for (const id of trips.keys()) if (!aliveIds.has(id)) trips.delete(id);
  for (const id of stalled.keys()) if (!aliveIds.has(id)) stalled.delete(id);
}
