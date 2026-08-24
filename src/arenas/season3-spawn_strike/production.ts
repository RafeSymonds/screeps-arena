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

/** 1 TOUGH + 5 MOVE + 4 ATTACK: full speed on plains, 1000 hits, 120 damage. */
const BRAWLER_CHUNK = 580;
const BRAWLER_MAX_CHUNKS = 5;

/**
 * 1 TOUGH + 4 MOVE + 2 RANGED_ATTACK + 1 HEAL. `heal` conflicts with `attack`
 * but not with `rangedAttack`, so a support creep can shoot and heal in the same
 * tick — which is why every opponent worth losing to carries both. Full speed on
 * plains, 20 damage at range 3, 12 hits a tick of healing.
 */
const MEDIC_CHUNK = 760;
const MEDIC_MAX_CHUNKS = 6;

function brawlerBody(energy: number, maxChunks = BRAWLER_MAX_CHUNKS): BodyPart[] | null {
  const chunks = Math.min(maxChunks, Math.floor(energy / BRAWLER_CHUNK));
  if (chunks < 1) return null;
  return layOutBody({ tough: chunks, move: chunks * 5, attack: chunks * 4 });
}

function medicBody(energy: number, maxChunks = MEDIC_MAX_CHUNKS): BodyPart[] | null {
  const chunks = Math.min(maxChunks, Math.floor(energy / MEDIC_CHUNK));
  if (chunks < 1) return null;
  return layOutBody({
    tough: chunks,
    move: chunks * 4,
    ranged: chunks * 2,
    heal: chunks,
  });
}

interface Order {
  role: Role;
  body: (energy: number) => BodyPart[] | null;
}

/**
 * Spawning costs 3 ticks per body part no matter how it is packaged, so the
 * total time to convert the board into creeps is fixed. Ordering small-to-large
 * therefore costs nothing and puts a body on the field a hundred ticks sooner,
 * which is what decides a race against an opponent that rushes the spawn.
 */
const OPENING: Order[] = [
  { role: 'runner', body: () => RUNNER },
  { role: 'runner', body: () => RUNNER },
  { role: 'hunter', body: energy => (energy >= bodyCost(HUNTER) ? HUNTER : null) },
  { role: 'medic', body: energy => medicBody(energy, 2) },
  { role: 'medic', body: energy => medicBody(energy, 4) },
  { role: 'brawler', body: energy => brawlerBody(energy, 2) },
  { role: 'medic', body: energy => medicBody(energy, 6) },
  { role: 'brawler', body: energy => brawlerBody(energy, 3) },
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

/**
 * True while the spawn is still turning banked energy into bodies. The army uses
 * this to decide whether waiting another moment actually buys it anything.
 */
export function stillBuilding(w: World): boolean {
  if (w.mySpawn?.spawning) return true;
  if (openingIndex < OPENING.length) return w.energyAvailable >= BRAWLER_CHUNK;
  return w.energyAvailable >= BRAWLER_CHUNK * 2;
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
