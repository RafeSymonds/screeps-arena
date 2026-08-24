import { ATTACK, HEAL, MOVE } from 'game/constants';
import type { Creep, StructureSpawn } from 'game/prototypes';
import { getRange } from 'game/utils';
import { bodyCost, countParts, isArmed, layOutBody } from '../../lib/body';
import type { BodyPart } from '../../lib/body';
import type { World } from '../../lib/world';
import { HOME_GUARD } from './plan';

export type Role = 'runner' | 'hunter' | 'brawler' | 'medic';

/**
 * There is no economy in this arena: all ~9000 energy is sitting in the spawn
 * and its 80 extensions from tick 1, and only the spawn's own +1/tick trickle
 * ever adds to it. So production is a fixed opening followed by "convert every
 * remaining scrap into brawlers", and the only real decision is what to build
 * first. Energy left in extensions is energy a raider can delete, which is one
 * more reason never to let the spawn idle.
 */

/**
 * One MOVE part, nothing else. Generates zero fatigue, so it crosses swamp at
 * full speed — the fastest thing on the map and the right tool for the flag
 * race. Standing on a flag also physically denies the tile to the enemy.
 */
const RUNNER: BodyPart[] = [MOVE];

/**
 * Five MOVE per working part exactly cancels swamp fatigue, so this keeps
 * 1 tile/tick everywhere while still hitting for 90. Built to win the middle
 * early and then eat the enemy's extensions, which are 100 hits apiece.
 */
const HUNTER: BodyPart[] = layOutBody({ move: 15, attack: 3 });

/** 1 TOUGH + 4 MOVE + 3 ATTACK: full speed on plains, 400 hits, 90 damage. */
const BRAWLER_CHUNK = 450;
const BRAWLER_MAX_CHUNKS = 6;

/** 1 TOUGH + 3 MOVE + 2 HEAL: full speed on plains, 24 hits/tick of healing. */
const MEDIC_CHUNK = 660;
const MEDIC_MAX_CHUNKS = 4;

function brawlerBody(energy: number, maxChunks = BRAWLER_MAX_CHUNKS): BodyPart[] | null {
  const chunks = Math.min(maxChunks, Math.floor(energy / BRAWLER_CHUNK));
  if (chunks < 1) return null;
  return layOutBody({ tough: chunks, move: chunks * 4, attack: chunks * 3 });
}

function medicBody(energy: number, maxChunks = MEDIC_MAX_CHUNKS): BodyPart[] | null {
  const chunks = Math.min(maxChunks, Math.floor(energy / MEDIC_CHUNK));
  if (chunks < 1) return null;
  return layOutBody({ tough: chunks, move: chunks * 3, heal: chunks * 2 });
}

interface Order {
  role: Role;
  body: (energy: number) => BodyPart[] | null;
}

const OPENING: Order[] = [
  { role: 'runner', body: () => RUNNER },
  { role: 'runner', body: () => RUNNER },
  { role: 'hunter', body: energy => (energy >= bodyCost(HUNTER) ? HUNTER : null) },
  { role: 'brawler', body: energy => brawlerBody(energy) },
  { role: 'medic', body: energy => medicBody(energy) },
  { role: 'brawler', body: energy => brawlerBody(energy) },
];

let openingIndex = 0;
const roles = new Map<string, Role>();

export function produce(w: World): void {
  const spawn = w.mySpawn;
  if (!spawn || spawn.spawning) return;

  if (openingIndex < OPENING.length) {
    const order = OPENING[openingIndex]!;
    const body = order.body(w.energyAvailable);
    // A body we cannot afford yet is worth waiting for; the queue is ordered.
    if (body && trySpawn(spawn, body, order.role)) openingIndex += 1;
    return;
  }

  // Opening done: everything that trickles in becomes another brawler. Build a
  // small one immediately if the base is under threat, otherwise save up.
  const underThreat = w.enemyCreeps.some(e => isArmed(e) && getRange(e, spawn) <= HOME_GUARD);
  const minChunks = underThreat ? 1 : 2;
  const body = brawlerBody(w.energyAvailable);
  if (body && body.length >= minChunks * 8) trySpawn(spawn, body, 'brawler');
}

function trySpawn(spawn: StructureSpawn, body: BodyPart[], role: Role): boolean {
  const result = spawn.spawnCreep(body);
  if (result.error !== undefined) return false;
  if (result.object) roles.set(String(result.object.id), role);
  return true;
}

export function openingDone(): boolean {
  return openingIndex >= OPENING.length;
}

export function roleOf(creep: Creep): Role {
  const known = roles.get(String(creep.id));
  if (known) return known;
  // Fallback for anything we did not see spawn (e.g. after a hot code reload).
  if (countParts(creep, HEAL) > 0) return 'medic';
  if (creep.body.length <= 2) return 'runner';
  if (countParts(creep, MOVE) >= countParts(creep, ATTACK) * 4) return 'hunter';
  return 'brawler';
}

export function pruneRoles(aliveIds: Set<string>): void {
  for (const id of roles.keys()) if (!aliveIds.has(id)) roles.delete(id);
}
