import { ATTACK, CARRY, MOVE, RESOURCE_ENERGY } from 'game/constants';
import type { Creep } from 'game/prototypes';
import { scaleBody } from '../../lib/body';
import { energyIn, world } from '../../lib/world';
import { runAttacker, runHauler, type Role } from './roles';

/** Haulers to keep alive before spending energy on military. */
const HAULER_TARGET = 2;
/** Attackers to mass before pushing the enemy spawn. */
const SQUAD_SIZE = 4;

// Module state survives for the whole match; the sandbox loads this file once.
const roles = new Map<Creep['id'], Role>();
let committed = false;

export function loop(): void {
  const w = world();
  if (!w.mySpawn) return; // spawn destroyed — nothing left to run

  const alive = new Set(w.myCreeps.map(c => c.id));
  for (const id of roles.keys()) if (!alive.has(id)) roles.delete(id);

  const haulers: Creep[] = [];
  const attackers: Creep[] = [];
  for (const creep of w.myCreeps) {
    const role = roles.get(creep.id) ?? classify(creep);
    roles.set(creep.id, role);
    (role === 'hauler' ? haulers : attackers).push(creep);
  }

  // Commit once and stay committed; retreating mid-push just feeds kills.
  if (!committed && attackers.length >= SQUAD_SIZE) committed = true;

  produce(haulers.length);

  for (const creep of haulers) runHauler(creep);
  for (const creep of attackers) runAttacker(creep, committed, w.mySpawn);

  for (const tower of w.myTowers) {
    const target = tower.findClosestByRange(w.enemyCreeps);
    if (target && energyIn(tower.store) >= 10) tower.attack(target);
  }
}

/** Infer a role from the body, so creeps survive a role-map reset. */
function classify(creep: Creep): Role {
  return creep.body.some(p => p.type === ATTACK) ? 'attacker' : 'hauler';
}

function produce(haulerCount: number): void {
  const w = world();
  const spawn = w.mySpawn;
  if (!spawn || spawn.spawning) return;

  const available = energyIn(spawn.store);

  if (haulerCount < HAULER_TARGET) {
    const body = scaleBody([CARRY, CARRY, MOVE], available, 4);
    if (body) spawn.spawnCreep(body);
    return;
  }

  // Bank a little before committing to a body, so we don't dribble out
  // one-part creeps while the haulers are still filling the spawn.
  const capacity = spawn.store.getCapacity(RESOURCE_ENERGY) ?? available;
  if (available < Math.min(260, capacity)) return;

  const body = scaleBody([ATTACK, ATTACK, MOVE], available, 6);
  if (body) spawn.spawnCreep(body);
}
