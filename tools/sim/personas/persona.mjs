// A parameterised opponent for the Pain and Gain simulator, written against
// the game API so the simulator loads it exactly like a saved build. Each
// persona file (temik911.mjs, …) fills in the parameters from that player's
// replays; see personas/README.md for where each number comes from.
//
// Positions in a persona are in the top-left player's frame. The bot mirrors
// them (x, y) -> (99 - x, 99 - y) when it starts bottom-right.
import { getObjectsByPrototype, getRange, getTerrainAt, getTicks, getDirection } from 'game/utils';
import { searchPath, CostMatrix } from 'game/path-finder';
import { Creep } from 'game/prototypes';
import {
  ATTACK,
  RANGED_ATTACK,
  HEAL,
  EFF_DAMAGE_TAKEN_MODIFIER,
  EFF_HEAL_MODIFIER,
  EFF_ATTACK_MODIFIER,
  EFF_RANGED_ATTACK_MODIFIER,
  TERRAIN_WALL,
} from 'game/constants';
import { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';

const KIND = {
  V: EFF_DAMAGE_TAKEN_MODIFIER,
  H: EFF_HEAL_MODIFIER,
  A: EFF_ATTACK_MODIFIER,
  R: EFF_RANGED_ATTACK_MODIFIER,
};

const live = (c, type) => c.body.some(p => p.type === type && p.hits > 0);
const armed = c => live(c, ATTACK) || live(c, RANGED_ATTACK);
const isScout = c =>
  !c.body.some(p => p.type === ATTACK || p.type === RANGED_ATTACK || p.type === HEAL);
const nearest = (from, list) =>
  list.reduce((b, o) => (!b || getRange(from, o) < getRange(from, b) ? o : b), undefined);

/**
 * @param {object} p persona parameters
 * @param {Array<[number, number, number]>} p.path army waypoints [tick, x, y], top-left frame; the
 *   army heads for the last waypoint whose tick has passed and holds there
 * @param {string[][]} p.scouts per scout, flag kinds to take in order, nearest of that kind first
 * @param {number} p.engage armed enemies this close to the army's centre start a fight
 * @param {number} p.chase in a fight, how far from its hold point the army will follow
 * @param {number} p.rangedRange distance ranged creeps keep from their target
 * @param {boolean} p.preheal whether idle healers heal the creep nearest the enemy
 */
export function persona(p) {
  let mirror;
  const rng = seeded(p.seed ?? 1);
  const frame = pos => (mirror ? { x: 99 - pos[0], y: 99 - pos[1] } : { x: pos[0], y: pos[1] });

  function step(c, goal, range, avoid) {
    if (getRange(c, goal) <= range) return;
    const m = new CostMatrix();
    for (const o of getObjectsByPrototype(Creep)) m.set(o.x, o.y, 255);
    for (const f of avoid) m.set(f.x, f.y, 255);
    const next = searchPath(c, { pos: goal, range }, { costMatrix: m, maxOps: 4000 }).path[0];
    if (next) c.move(getDirection(next.x - c.x, next.y - c.y));
  }

  return function loop() {
    const t = getTicks();
    const creeps = getObjectsByPrototype(Creep);
    const mine = creeps.filter(c => c.my);
    const foes = creeps.filter(c => c.my === false);
    const flags = getObjectsByPrototype(ScoreFlag);
    if (mirror === undefined) {
      const sx = mine.reduce((a, c) => a + c.x, 0) / Math.max(1, mine.length);
      mirror = sx > 50;
    }

    const army = mine.filter(c => !isScout(c));
    const scouts = mine.filter(isScout);
    const wp = p.path.filter(w => w[0] <= t).pop() ?? p.path[0];
    const hold = frame([wp[1], wp[2]]);
    const mid = army.length
      ? {
          x: Math.round(army.reduce((a, c) => a + c.x, 0) / army.length),
          y: Math.round(army.reduce((a, c) => a + c.y, 0) / army.length),
        }
      : hold;

    // Scouts take flags in their persona's order.
    const claimed = new Set();
    scouts.forEach((s, i) => {
      const plan = p.scouts[i] ?? [];
      for (const k of plan) {
        const options = flags.filter(
          f => f.effectType === KIND[k] && f.my !== true && !claimed.has(f),
        );
        const f = nearest(s, options);
        if (f) {
          claimed.add(f);
          step(s, f, 0, []);
          return;
        }
      }
    });

    // Every armed or healing creep acts each tick: one shared focus target.
    const armedFoes = foes.filter(armed);
    const inFight = armedFoes.filter(e => getRange(e, mid) <= p.engage);
    const pool = inFight.length ? inFight : foes.filter(e => getRange(e, mid) <= p.engage);
    const focus = pool.reduce(
      (b, e) => (!b || e.hits / e.hitsMax < b.hits / b.hitsMax ? e : b),
      undefined,
    );
    const front = focus ? nearest(focus, army) : undefined;
    for (const c of army) {
      if (live(c, ATTACK)) {
        const t1 = foes.filter(e => getRange(c, e) <= 1);
        if (t1.length) c.attack(t1.includes(focus) ? focus : t1[0]);
      }
      if (live(c, RANGED_ATTACK)) {
        const t3 = foes.filter(e => getRange(c, e) <= 3);
        if (t3.length) c.rangedAttack(t3.includes(focus) ? focus : nearest(c, t3));
      }
      if (live(c, HEAL)) {
        const hurt = army
          .filter(f => f.hits < f.hitsMax && getRange(c, f) <= 3)
          .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0];
        const target = hurt ?? (p.preheal && front && getRange(c, front) <= 3 ? front : undefined);
        if (target && getRange(c, target) <= 1) c.heal(target);
        else if (target) c.rangedHeal(target);
      }
    }

    // Movement: hold the waypoint, fight what comes within reach of it.
    const keepOff = flags.filter(f => f.my === false);
    const taken = new Set(creeps.map(o => o.x * 100 + o.y));
    for (const c of army) {
      // With a learned policy, a creep near an armed enemy moves the way the
      // real player's creeps did in the same situation (see learn.mjs).
      const near = nearest(c, armedFoes);
      if (p.policy && near && getRange(c, near) <= 8) {
        const role = live(c, ATTACK) ? 'M' : live(c, RANGED_ATTACK) ? 'R' : 'H';
        const bal =
          army.filter(o => armed(o) && getRange(o, c) <= 5).length -
          armedFoes.filter(o => getRange(o, c) <= 5).length;
        const choice = sample(p.policy, role, c.hits / c.hitsMax, getRange(c, near), bal, rng);
        if (choice) {
          moveBy(c, near, choice, focus, hold, taken);
          continue;
        }
      }
      if (focus && getRange(focus, hold) <= p.chase) {
        if (live(c, ATTACK)) step(c, focus, 1, keepOff);
        else if (live(c, RANGED_ATTACK)) {
          const biter = foes.find(e => live(e, ATTACK) && getRange(c, e) <= 1);
          if (biter) step(c, hold, 0, keepOff);
          else step(c, focus, p.rangedRange, keepOff);
        } else {
          const ward = army
            .filter(f => f !== c)
            .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0];
          if (ward) step(c, ward, 1, keepOff);
        }
      } else {
        step(c, hold, 2, keepOff);
      }
    }
  };
}

/** Small deterministic generator, so a persona plays the same match the same way. */
function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const bucket = (hp, d, bal, r) =>
  `${r}|${hp >= 0.75 ? 'hi' : hp >= 0.5 ? 'mid' : 'lo'}|${Math.min(d, 8)}|${Math.max(-3, Math.min(3, bal))}`;

/** Draw 'in', 'hold' or 'out' from the learned counts, falling back to coarser situations. */
function sample(policy, role, hp, d, bal, rng) {
  const t =
    policy[bucket(hp, d, bal, role)] ??
    policy[bucket(hp, d, 0, role)] ??
    policy[bucket(1, d, 0, role)];
  if (!t) return undefined;
  const n = t.in + t.hold + t.out;
  if (n < 5) return undefined;
  const r = rng() * n;
  return r < t.in ? 'in' : r < t.in + t.hold ? 'hold' : 'out';
}

/**
 * Step to a free tile that changes the distance to `near` the way `choice` says,
 * closing on the focus when going in and falling back toward the hold point
 * when going out.
 */
function moveBy(c, near, choice, focus, hold, taken) {
  if (choice === 'hold') return;
  const d0 = getRange(c, near);
  let best;
  let bestScore = -Infinity;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (!dx && !dy) continue;
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 1 || x > 98 || y < 1 || y > 98) continue;
      if (taken.has(x * 100 + y) || getTerrainAt({ x, y }) === TERRAIN_WALL) continue;
      const d1 = getRange({ x, y }, near);
      if (choice === 'in' ? d1 >= d0 : d1 <= d0) continue;
      const score =
        choice === 'in' ? -getRange({ x, y }, focus ?? near) : -getRange({ x, y }, hold);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  if (!best) return;
  taken.delete(c.x * 100 + c.y);
  taken.add(best.x * 100 + best.y);
  c.move(getDirection(best.x - c.x, best.y - c.y));
}
