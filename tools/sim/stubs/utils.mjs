import { state } from './state.mjs';
import { TERRAIN_PLAIN, TERRAIN_SWAMP, TERRAIN_WALL } from './constants.mjs';
import { searchPath } from './path-finder.mjs';

export function getTicks() {
  return state.tick;
}

export function getObjectsByPrototype(proto) {
  return state.objects.filter(o => o instanceof proto);
}

export function getObjects() {
  return state.objects.slice();
}

export function getObjectById(id) {
  return state.objects.find(o => String(o.id) === String(id));
}

export function getRange(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function getTerrainAt(pos) {
  const t = state.terrain[pos.y * 100 + pos.x];
  return t === 1 ? TERRAIN_WALL : t === 2 ? TERRAIN_SWAMP : TERRAIN_PLAIN;
}

export function getDirection(dx, dy) {
  if (dx === 0 && dy < 0) return 1;
  if (dx > 0 && dy < 0) return 2;
  if (dx > 0 && dy === 0) return 3;
  if (dx > 0 && dy > 0) return 4;
  if (dx === 0 && dy > 0) return 5;
  if (dx < 0 && dy > 0) return 6;
  if (dx < 0 && dy === 0) return 7;
  return 8;
}

export function findInRange(from, positions, range) {
  return positions.filter(p => getRange(from, p) <= range);
}

export function findClosestByRange(from, positions) {
  let best = null;
  let bestRange = Infinity;
  for (const p of positions) {
    const r = getRange(from, p);
    if (r < bestRange) {
      bestRange = r;
      best = p;
    }
  }
  return best;
}

export function findPath(from, to, opts = {}) {
  return searchPath(from, to, opts).path;
}

export function findClosestByPath(from, positions, opts = {}) {
  let best = null;
  let bestCost = Infinity;
  for (const p of positions) {
    const r = searchPath(from, { pos: p, range: 1 }, opts);
    if (!r.incomplete && r.cost < bestCost) {
      bestCost = r.cost;
      best = p;
    }
  }
  return best;
}

export function getCpuTime() {
  return 0;
}

export function getHeapStatistics() {
  return {};
}

export function createConstructionSite() {
  return { error: -7 };
}
