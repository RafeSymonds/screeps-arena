import { ATTACK, MOVE } from 'game/constants';
import type { Creep, StructureSpawn } from 'game/prototypes';
import { getTicks } from 'game/utils';
import { scaleBody } from '../../lib/body';
import { energyIn, world } from '../../lib/world';
import { reportArena, reportProgress } from './recon';

/**
 * Season 3 Spawn Strike (basic).
 *
 * Objective: destroy the enemy spawn before they destroy yours.
 *
 * This is a first pass written without knowing what the map holds — see recon.ts.
 * It deliberately makes no assumption that containers or sources exist, and
 * spends energy only on melee attackers.
 */

/** Attackers to gather before committing to the push. */
const SQUAD_SIZE = 4;
/** Enemies this close to our spawn are handled before anything else. */
const DEFEND_RADIUS = 12;
/** Hold this far off the spawn while massing, so we don't block it. */
const RALLY_RADIUS = 5;
/** Print a progress line this often. */
const REPORT_EVERY = 50;

let committed = false;

export function loop(): void {
  const tick = getTicks();
  if (tick === 1) reportArena();

  const w = world();
  const spawn = w.mySpawn;
  if (!spawn) return; // our spawn is gone; the match is already decided

  produce(spawn);
  for (const creep of w.myCreeps) run(creep, spawn);

  if (tick % REPORT_EVERY === 0) {
    reportProgress(spawn.hits ?? 0, w.enemySpawn?.hits ?? 0, w.myCreeps.length);
  }
}

function produce(spawn: StructureSpawn): void {
  if (spawn.spawning) return;

  // 1:1 ATTACK/MOVE moves at full speed on plains and still hits hard.
  const body = scaleBody([ATTACK, MOVE], energyIn(spawn.store), 8);
  if (body) spawn.spawnCreep(body);
}

function run(creep: Creep, spawn: StructureSpawn): void {
  const w = world();

  // Defence first: anything threatening our spawn outranks the push.
  const threats = creep.findInRange(w.enemyCreeps, DEFEND_RADIUS).length
    ? w.enemyCreeps.filter(e => e.getRangeTo(spawn) <= DEFEND_RADIUS)
    : [];
  if (threats.length > 0) {
    engage(creep, creep.findClosestByPath(threats));
    return;
  }

  if (!committed) {
    committed = w.myCreeps.length >= SQUAD_SIZE;
    if (!committed) {
      if (creep.getRangeTo(spawn) > RALLY_RADIUS) creep.moveTo(spawn);
      return;
    }
  }

  // Clear whatever blocks the push, then hit the spawn itself.
  const nearby = creep.findInRange(w.enemyCreeps, 3);
  if (nearby.length > 0) {
    engage(creep, creep.findClosestByRange(nearby));
    return;
  }
  if (w.enemySpawn) engage(creep, w.enemySpawn);
}

function engage(creep: Creep, target: Parameters<Creep['attack']>[0]): void {
  if (creep.attack(target) !== 0) creep.moveTo(target);
}
