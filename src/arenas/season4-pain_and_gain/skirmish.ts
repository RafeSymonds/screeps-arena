import { ATTACK, HEAL, HEAL_POWER, RANGED_ATTACK, TERRAIN_WALL } from 'game/constants';
import type { Creep } from 'game/prototypes';
import type { Position } from 'game/prototypes/game-object';
import { getDirection, getRange, getTerrainAt } from 'game/utils';
import { countParts, meleeDamage, rangedDamage } from '../../lib/body';
import type { Mults } from './flags';
import { disarmed } from './targets';

/**
 * Tile-by-tile fighting. Each creep in a fight scores the nine tiles it can
 * stand on next tick and takes the best one for its role, instead of following
 * fixed rules like "melee closes to 1, ranged holds at 3". The scores come
 * from two maps:
 *
 * - threat: the damage the enemy can land on a tile next tick. Enemy melee
 *   reaches tiles within 2 (one step and a swing); enemy ranged within 4 (one
 *   step and a shot at 3).
 * - reach: the damage a creep of ours could deal from a tile next tick.
 *
 * Replays of the strongest players showed the difference from us is where they
 * stand and when they step in, not whom they shoot. See the design doc, "Pain
 * and Gain bot redesign".
 */

const SIZE = 100;
const idx = (x: number, y: number) => y * SIZE + x;

/** Tiles each enemy melee threatens: one step plus a swing. */
const MELEE_THREAT_RANGE = 2;
/** Tiles each enemy ranged threatens: one step plus a shot at three. */
const RANGED_THREAT_RANGE = 4;

export interface Field {
  threat: Float32Array;
  /** Tiles taken this tick, by creeps already moved or standing still. */
  taken: Set<number>;
}

export function buildField(
  enemies: readonly Creep[],
  theirMults: Mults,
  everyone: readonly Creep[],
): Field {
  const threat = new Float32Array(SIZE * SIZE);
  for (const e of enemies) {
    const melee = meleeDamage(e) * theirMults.attack;
    const ranged = rangedDamage(e) * theirMults.ranged;
    if (melee === 0 && ranged === 0) continue;
    const r = ranged > 0 ? RANGED_THREAT_RANGE : MELEE_THREAT_RANGE;
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        const x = e.x + dx;
        const y = e.y + dy;
        if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        let t = 0;
        if (d <= MELEE_THREAT_RANGE) t += melee;
        if (d <= RANGED_THREAT_RANGE) t += ranged;
        threat[idx(x, y)] += t;
      }
    }
  }
  const taken = new Set(everyone.map(c => idx(c.x, c.y)));
  return { threat, taken };
}

export const threatAt = (f: Field, p: Position): number => f.threat[idx(p.x, p.y)]!;

/** The nine tiles a creep could stand on next tick, walls and occupied tiles out. */
function options(c: Creep, f: Field): Position[] {
  const out: Position[] = [{ x: c.x, y: c.y }];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue;
      if (f.taken.has(idx(x, y))) continue;
      if (getTerrainAt({ x, y }) === TERRAIN_WALL) continue;
      out.push({ x, y });
    }
  }
  return out;
}

export interface Fight {
  field: Field;
  enemies: readonly Creep[];
  focus: Creep;
  /** Whether the army is committing to the fight this tick, or holding at the edge. */
  commit: boolean;
  /** Where the army stands: members keep close to it. */
  anchor: Position;
  /** Friends a healer should stand by, most endangered first. */
  patients: readonly Creep[];
  healers: readonly Creep[];
}

/** Our damage per tick from `p` at the best enemy in reach, focus preferred. */
function reachFrom(c: Creep, p: Position, ctx: Fight): number {
  let best = 0;
  const melee = meleeDamage(c);
  const ranged = rangedDamage(c);
  for (const e of ctx.enemies) {
    const d = getRange(p, e);
    let v = 0;
    if (melee > 0 && d <= 1) v += melee;
    if (ranged > 0 && d <= 3) v += ranged;
    if (e === ctx.focus) v *= 1.5;
    if (v > best) best = v;
  }
  return best;
}

/**
 * Pick this creep's tile for next tick and move there. Creeps are moved one at
 * a time and each claims its tile, so two never pick the same one.
 */
export function step(c: Creep, ctx: Fight): void {
  const f = ctx.field;
  const hp = c.hits / c.hitsMax;
  const hurt = disarmed(c) || hp < HURT_AT;
  const isMelee = countParts(c, ATTACK) > 0;
  const isRanged = countParts(c, RANGED_ATTACK) > 0;
  const isHealer = countParts(c, HEAL) > 0 && !isMelee && !isRanged;

  let best: Position = { x: c.x, y: c.y };
  let bestScore = -Infinity;
  for (const p of options(c, f)) {
    const threat = threatAt(f, p);
    const leash = Math.max(0, getRange(p, ctx.anchor) - LEASH) * LEASH_COST;
    let score: number;
    if (hurt) {
      // Out of reach, beside a healer: the step-back strong players do.
      const medic = nearest(
        p,
        ctx.healers.filter(h => h !== c),
      );
      score = -threat - (medic ? Math.max(0, getRange(p, medic) - 1) * 20 : 0);
    } else if (isHealer) {
      // Beside whoever is about to take the most, no deeper in than they are.
      const patient = ctx.patients.find(q => q !== c);
      const by = patient ? Math.max(0, getRange(p, patient) - 1) * 40 : 0;
      const exposed = patient ? Math.max(0, threat - threatAt(f, patient)) : threat;
      score = -by - exposed - 0.2 * threat;
    } else if (ctx.commit) {
      // Damage out minus damage in. Ranged weigh their own safety more the
      // more hurt they are, which makes them kite.
      const gain = reachFrom(c, p, ctx);
      const care = isMelee ? MELEE_CARE : RANGED_CARE * (1.5 - hp);
      score = gain - care * threat;
    } else if (isRanged && !isMelee) {
      // Holding, ranged still answer fire where it is cheap. Holding fully out
      // of reach lost the ranged trade 2 to 1 in the first real games: their
      // ranged poked our edge while ours stood back.
      score = HOLD_RETURN_FIRE * reachFrom(c, p, ctx) - HOLD_CARE * threat;
    } else {
      // Holding: stay out of reach, as close to the edge as that allows.
      const edge = getRange(p, ctx.focus);
      score = -threat * 10 - edge;
    }
    score -= leash;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  f.taken.delete(idx(c.x, c.y));
  f.taken.add(idx(best.x, best.y));
  if (best.x !== c.x || best.y !== c.y) c.move(getDirection(best.x - c.x, best.y - c.y));
}

function nearest(p: Position, list: readonly Creep[]): Creep | undefined {
  let best: Creep | undefined;
  let d = Infinity;
  for (const c of list) {
    const r = getRange(p, c);
    if (r < d) {
      d = r;
      best = c;
    }
  }
  return best;
}

/**
 * Whether to commit: the damage our army can land next tick against what
 * theirs can land on us where we stand. Replaces a fixed "enemy within 8"
 * trigger, which sent us into every fight whether it favoured us or not.
 */
export function favourable(
  army: readonly Creep[],
  ctx: Omit<Fight, 'commit'>,
  ourMults: Mults,
): boolean {
  let ours = 0;
  let theirs = 0;
  let heal = 0;
  for (const c of army) {
    heal += countParts(c, HEAL) * HEAL_POWER * ourMults.heal;
    if (disarmed(c)) continue;
    const near = nearest(c, ctx.enemies);
    if (!near) continue;
    const d = getRange(c, near);
    if (d <= MELEE_THREAT_RANGE) ours += meleeDamage(c) * ourMults.attack;
    if (d <= RANGED_THREAT_RANGE) ours += rangedDamage(c) * ourMults.ranged;
    theirs += threatAt(ctx.field, c) * ourMults.damageTaken;
  }
  // Our healing soaks part of what they land.
  return ours >= Math.max(0, theirs - heal) * COMMIT_MARGIN;
}

/** Below this fraction of its hits a creep steps back to a healer. */
const HURT_AT = 0.5;
/** Members stray at most this far from the anchor before it costs them. */
const LEASH = 4;
const LEASH_COST = 30;
/** How much a melee creep minds threat when committed: it is there to trade. */
const MELEE_CARE = 0.3;
/** How much a ranged creep minds threat at full hits; more as it is hurt. */
const RANGED_CARE = 0.6;
/** Commit when our next-tick damage is at least this share of theirs. */
const COMMIT_MARGIN = 0.9;
/** Holding, how much a ranged creep values a shot against the threat of taking one. */
const HOLD_RETURN_FIRE = 0.5;
const HOLD_CARE = 1;
