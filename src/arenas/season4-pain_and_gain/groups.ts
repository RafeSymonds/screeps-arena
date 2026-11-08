import { ATTACK, EFF_DAMAGE_TAKEN_MODIFIER, HEAL, RANGED_ATTACK } from 'game/constants';
import type { Creep } from 'game/prototypes';
import type { Position } from 'game/prototypes/game-object';
import { getRange } from 'game/utils';
import { countParts, isArmed } from '../../lib/body';
import type { Orders } from './army';
import { armyOf, closest } from './army';
import type { FlagPlan } from './flags';
import type { State } from './state';
import { centroid } from './terrain';
import { disarmed } from './targets';

/**
 * Splitting the army, for an enemy that has split its own.
 *
 * felixnightshade beat us 75 games of 81 on score and was never wiped. It walks
 * groups of four or five, and single creeps, around the map retaking flags. It
 * took a flag back 198 times in ten games, with two creeps on average, nobody of
 * ours within six tiles, and a median of 58 ticks after we had taken it. One army
 * cannot answer that, however strong: it can only be in one place.
 *
 * The flags fall into three zones of their own: one side of the map's diagonal
 * (10 points a tick), the other side (10), and the centre (5). One group per zone
 * holds any two of them for at least 15 of the 25.
 */

const LINK = 6;
/** Split once their biggest group has at most this many armed creeps... */
const SPLIT_LARGEST = 6;
/** ...for this long, in at least this many separate places... */
const SPLIT_AFTER = 20;
const SPLIT_CLUSTERS = 3;
/** ...and come back together when one group holds this many. */
const REGROUP_LARGEST = 7;
/** Below this many fighters a split leaves nothing strong anywhere. */
const MIN_ARMY = 6;
/** An armed enemy this close to a group is fought. */
const ENGAGE = 10;
/** Outnumbered by more than this, a group falls back on the nearest other group. */
const OUTNUMBERED = 1;
/** An owned flag with an armed enemy this close is the one to go and stand by. */
const THREAT = 15;

let split = false;
let scatteredSince: number | undefined;
/** Creep id to group number, fixed when the split is made. */
const membership = new Map<string, number>();

function armedClusters(enemies: readonly Creep[]): Creep[][] {
  const left = new Set(enemies);
  const out: Creep[][] = [];
  for (const start of enemies) {
    if (!left.delete(start)) continue;
    const group = [start];
    for (let i = 0; i < group.length; i += 1) {
      for (const other of left) {
        if (getRange(group[i]!, other) <= LINK) {
          left.delete(other);
          group.push(other);
        }
      }
    }
    out.push(group);
  }
  return out;
}

/** Deal the army out evenly by role, so every group has a healer and both weapons. */
function assign(army: readonly Creep[]): void {
  membership.clear();
  let next = 0;
  for (const part of [ATTACK, RANGED_ATTACK, HEAL] as const) {
    for (const c of army) {
      if (membership.has(String(c.id)) || countParts(c, part) === 0) continue;
      membership.set(String(c.id), next % 3);
      next += 1;
    }
  }
  for (const c of army) {
    if (membership.has(String(c.id))) continue;
    membership.set(String(c.id), next % 3);
    next += 1;
  }
}

/** Decide whether the army is split this tick. Sticky, with a gap between the two thresholds. */
export function updateSplit(s: State): boolean {
  const army = armyOf(s);
  const enemies = s.enemyCreeps.filter(isArmed);
  const clusters = armedClusters(enemies);
  const largest = Math.max(0, ...clusters.map(c => c.length));
  const fighters = army.filter(c => !disarmed(c)).length;

  if (split) {
    if (enemies.length === 0 || largest >= REGROUP_LARGEST || fighters < MIN_ARMY) {
      split = false;
      scatteredSince = undefined;
    }
    return split;
  }

  const scattered =
    enemies.length > 0 &&
    largest <= SPLIT_LARGEST &&
    clusters.length >= SPLIT_CLUSTERS &&
    fighters >= MIN_ARMY &&
    s.enemyRate > s.myRate;
  if (!scattered) {
    scatteredSince = undefined;
    return false;
  }
  scatteredSince ??= s.tick;
  if (s.tick - scatteredSince < SPLIT_AFTER) return false;
  assign(army);
  split = true;
  return true;
}

/** Flags of the zone a group works: 0 and 1 are either side of the diagonal, 2 is the centre. */
function zoneOf(s: State, zone: number): State['flags'] {
  const isCentre = (f: State['flags'][number]) => f.effectType === EFF_DAMAGE_TAKEN_MODIFIER;
  if (zone === 2) return s.flags.filter(isCentre);
  return s.flags.filter(f => !isCentre(f) && (zone === 0) === f.x > f.y);
}

export interface Squad {
  members: Creep[];
  orders: Orders;
}

export function squads(s: State, plan: FlagPlan): Squad[] {
  const army = armyOf(s);
  const members: Creep[][] = [[], [], []];
  for (const c of army) members[membership.get(String(c.id)) ?? 2]!.push(c);

  // Each group takes the zone nearest it, the first come first served.
  const zones = new Map<number, number>();
  const free = new Set([0, 1, 2]);
  for (let g = 0; g < members.length; g += 1) {
    const here = centroid(members[g]!);
    if (!here) continue;
    let best = 0;
    let bestD = Infinity;
    for (const z of free) {
      const d = Math.min(...zoneOf(s, z).map(f => getRange(f, here)));
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    free.delete(best);
    zones.set(g, best);
  }

  const enemies = s.enemyCreeps.filter(isArmed);
  const wanted = s.flags.filter(f => f.my !== true && plan.wanted.has(String(f.id)));
  const claimed = new Set<unknown>();
  const out: Squad[] = [];
  for (let g = 0; g < members.length; g += 1) {
    const group = members[g]!;
    const here = centroid(group);
    if (!here) continue;
    const zone = zoneOf(s, zones.get(g)!);
    out.push({
      members: group,
      orders: squadOrders(s, g, here, group, zone, members, enemies, wanted, claimed),
    });
  }
  return out;
}

function squadOrders(
  s: State,
  g: number,
  here: Position,
  group: readonly Creep[],
  zone: State['flags'],
  all: readonly Creep[][],
  enemies: readonly Creep[],
  wanted: State['flags'],
  claimed: Set<unknown>,
): Orders {
  const near = enemies.filter(e => getRange(e, here) <= ENGAGE);
  const strength = group.filter(c => !disarmed(c)).length;
  if (near.length > strength + OUTNUMBERED) {
    const others = all
      .filter((m, i) => i !== g && m.length > 0)
      .map(m => centroid(m))
      .filter((p): p is Position => p !== undefined);
    const friend = closest(here, others);
    if (friend) return { mode: 'guard', target: friend, range: 2 };
  }
  const foe = closest(here, near);
  if (foe) return { mode: 'hunt', target: foe, range: 1 };

  const mine = wanted.filter(f => zone.includes(f) && !claimed.has(f));
  const flag =
    closest(here, mine) ??
    closest(
      here,
      wanted.filter(f => !claimed.has(f)),
    );
  if (flag) {
    claimed.add(flag);
    const sitter = s.enemyCreeps.find(e => e.x === flag.x && e.y === flag.y);
    if (sitter) return { mode: 'hunt', target: sitter, range: 1 };
    return { mode: 'escort', target: flag, range: 0 };
  }

  const threatened = zone.filter(f => f.my === true && enemies.some(e => getRange(e, f) <= THREAT));
  const post = closest(here, threatened) ?? closest(here, zone);
  return { mode: 'guard', target: post, range: 2 };
}
