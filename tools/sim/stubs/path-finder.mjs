import { state } from './state.mjs';

export class CostMatrix {
  constructor() {
    this.data = new Uint8Array(10000);
  }
  get(x, y) {
    return this.data[y * 100 + x];
  }
  set(x, y, cost) {
    this.data[y * 100 + x] = Math.max(0, Math.min(255, cost | 0));
  }
  clone() {
    const m = new CostMatrix();
    m.data.set(this.data);
    return m;
  }
}

const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/**
 * Uniform-cost search. Slower than the real (native) pathfinder but exact,
 * which is what a correctness smoke test wants.
 */
export const stats = { calls: 0, ops: 0 };

export function searchPath(origin, goal, opts = {}) {
  stats.calls += 1;
  const plainCost = opts.plainCost ?? 2;
  const swampCost = opts.swampCost ?? 10;
  const matrix = opts.costMatrix;
  const maxOps = opts.maxOps ?? 50000;
  const flee = opts.flee ?? false;

  const goals = (Array.isArray(goal) ? goal : [goal]).map(g =>
    g.pos ? { x: g.pos.x, y: g.pos.y, range: g.range ?? 0 } : { x: g.x, y: g.y, range: 0 },
  );

  const cost = (x, y) => {
    if (matrix) {
      const c = matrix.get(x, y);
      if (c >= 255) return Infinity;
      if (c > 0) return c;
    }
    const t = state.terrain[y * 100 + x];
    if (t === 1) return Infinity;
    return t === 2 ? swampCost : plainCost;
  };

  const atGoal = (x, y) => {
    const inRange = goals.some(g => Math.max(Math.abs(g.x - x), Math.abs(g.y - y)) <= g.range);
    return flee ? !inRange : inRange;
  };

  const heuristicWeight = opts.heuristicWeight ?? 1.2;
  const h = (x, y) =>
    flee
      ? 0
      : Math.min(...goals.map(g => Math.max(Math.abs(g.x - x), Math.abs(g.y - y)))) *
        plainCost *
        heuristicWeight;

  const dist = new Float64Array(10000).fill(Infinity);
  const prev = new Int32Array(10000).fill(-1);
  const start = origin.y * 100 + origin.x;
  dist[start] = 0;
  let seq = 0;
  // Binary heap keyed by f = g + weight*h, with insertion order as a stable
  // tie-break so equal-cost routes do not flip between calls.
  const heap = [[h(origin.x, origin.y), seq++, start, 0]];
  const push = item => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (before(heap[p], heap[i])) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const before = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < heap.length && before(heap[l], heap[s])) s = l;
        if (r < heap.length && before(heap[r], heap[s])) s = r;
        if (s === i) break;
        [heap[s], heap[i]] = [heap[i], heap[s]];
        i = s;
      }
    }
    return top;
  };

  let ops = 0;
  let found = -1;
  let bestFallback = start;
  let bestHeuristic = Infinity;

  while (heap.length > 0 && ops < maxOps) {
    const [, , idx, d] = pop();
    if (d > dist[idx]) continue;
    ops += 1;
    const x = idx % 100;
    const y = (idx - x) / 100;
    if (idx !== start && atGoal(x, y)) {
      found = idx;
      break;
    }
    const remaining = Math.min(...goals.map(g => Math.max(Math.abs(g.x - x), Math.abs(g.y - y))));
    if (remaining < bestHeuristic) {
      bestHeuristic = remaining;
      bestFallback = idx;
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx > 99 || ny < 0 || ny > 99) continue;
      const c = cost(nx, ny);
      if (!isFinite(c)) continue;
      const ni = ny * 100 + nx;
      if (d + c < dist[ni]) {
        dist[ni] = d + c;
        prev[ni] = idx;
        push([d + c + h(nx, ny), seq++, ni, d + c]);
      }
    }
  }

  const incomplete = found < 0;
  const end = incomplete ? bestFallback : found;
  const path = [];
  let cur = end;
  while (cur !== -1 && cur !== start) {
    path.push({ x: cur % 100, y: (cur - (cur % 100)) / 100 });
    cur = prev[cur];
  }
  path.reverse();
  stats.ops += ops;
  return { path, ops, cost: dist[end], incomplete };
}
