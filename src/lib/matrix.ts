import { CostMatrix } from 'game/path-finder';
import { getRange } from 'game/utils';
import type { World } from './world';
import { isArmed } from './body';

/** A CostMatrix value of 255 or more is impassable. */
const BLOCKED = 255;
/** Our own creeps are worth stepping around but never worth a long detour. */
const FRIEND_COST = 4;
/** An enemy creep physically blocks its tile; make paths bend around it. */
const ENEMY_COST = 40;

export interface MatrixOptions {
  /**
   * Cost of standing on one of our own ramparts. Anything below `plainCost` (2)
   * turns the central rampart cross into a preferred highway, which is exactly
   * what we want: a creep on our rampart cannot be hit, attackers have to chew
   * through the 10k-hit rampart instead.
   */
  rampartCost?: number;
  /** Extra cost painted around enemy creeps, for units that want to avoid them. */
  dangerCost?: number;
  /** Radius of that paint. */
  dangerRange?: number;
  /** Treat the flank-passage walls as passable — only for planning, not walking. */
  ignoreWalls?: boolean;
}

/**
 * Note that supplying a costMatrix turns off `findPath`'s automatic obstacle
 * avoidance, so every obstacle on the map has to be spelled out here.
 */
export function travelMatrix(w: World, opts: MatrixOptions = {}): CostMatrix {
  const m = new CostMatrix();

  // Painted first so that everything below overrides it.
  const dangerCost = opts.dangerCost ?? 0;
  if (dangerCost > 0) {
    const range = opts.dangerRange ?? 4;
    for (const enemy of w.enemyCreeps) {
      if (!isArmed(enemy)) continue;
      for (let dx = -range; dx <= range; dx += 1) {
        for (let dy = -range; dy <= range; dy += 1) {
          const x = enemy.x + dx;
          const y = enemy.y + dy;
          if (x < 0 || x > 99 || y < 0 || y > 99) continue;
          m.set(x, y, dangerCost);
        }
      }
    }
  }

  for (const r of w.ramparts) {
    // A neutral rampart blocks nobody, so it keeps its terrain cost.
    if (r.my === true) m.set(r.x, r.y, opts.rampartCost ?? 1);
    else if (r.my === false) m.set(r.x, r.y, BLOCKED);
  }

  if (!opts.ignoreWalls) for (const s of w.walls) m.set(s.x, s.y, BLOCKED);
  for (const s of w.extensions) m.set(s.x, s.y, BLOCKED);
  for (const s of w.spawns) m.set(s.x, s.y, BLOCKED);

  for (const c of w.myCreeps) m.set(c.x, c.y, FRIEND_COST);
  for (const c of w.enemyCreeps) m.set(c.x, c.y, ENEMY_COST);

  return m;
}

/** The rampart of ours that sits closest to `pos`, if we hold any. */
export function nearestRampart(w: World, pos: { x: number; y: number }) {
  let best: { x: number; y: number } | undefined;
  let bestRange = Infinity;
  for (const r of w.myRamparts) {
    const range = getRange(pos, r);
    if (range < bestRange) {
      bestRange = range;
      best = { x: r.x, y: r.y };
    }
  }
  return best;
}
