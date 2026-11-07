import { CostMatrix } from 'game/path-finder';
import type { Position } from 'game/prototypes/game-object';
import type { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';
import { isArmed } from '../../lib/body';
import type { State } from './state';

const BLOCKED = 255;
const FRIEND_COST = 4;
const ENEMY_COST = 40;

export interface MatrixOptions {
  /** Flags this path must not step on. Standing on a flag captures it, debuff and all. */
  avoid: readonly ScoreFlag[];
  /** Extra cost painted around armed enemies. */
  dangerCost?: number;
  dangerRange?: number;
}

/**
 * Supplying a costMatrix turns off the pathfinder's own obstacle handling, so
 * creeps are spelled out here. Terrain still applies wherever the matrix is 0.
 */
export function buildMatrix(s: State, opts: MatrixOptions): CostMatrix {
  const m = new CostMatrix();

  const dangerCost = opts.dangerCost ?? 0;
  if (dangerCost > 0) {
    const r = opts.dangerRange ?? 4;
    for (const e of s.enemyCreeps) {
      if (!isArmed(e)) continue;
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          const x = e.x + dx;
          const y = e.y + dy;
          if (x < 0 || x > 99 || y < 0 || y > 99) continue;
          m.set(x, y, dangerCost);
        }
      }
    }
  }

  for (const f of opts.avoid) m.set(f.x, f.y, BLOCKED);
  for (const c of s.myCreeps) m.set(c.x, c.y, FRIEND_COST);
  for (const c of s.enemyCreeps) m.set(c.x, c.y, ENEMY_COST);
  return m;
}

export function centroid(points: readonly Position[]): Position | undefined {
  if (points.length === 0) return undefined;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: Math.round(x / points.length), y: Math.round(y / points.length) };
}
