import { RESOURCE_ENERGY } from 'game/constants';
import type { Creep, StructureSpawn } from 'game/prototypes';
import { getRange } from 'game/utils';
import { energyIn, freeSpaceIn, world } from '../../lib/world';

export type Role = 'hauler' | 'attacker';

/** Distance from our spawn inside which an enemy counts as an attacker, not a raid target. */
const DEFEND_RADIUS = 12;

/**
 * Shuttle energy from containers into the spawn and extensions so we can keep
 * producing attackers. Falls back to harvesting if the arena has sources and
 * the creep happens to carry WORK parts.
 */
export function runHauler(creep: Creep): void {
  const w = world();
  if (!w.mySpawn) return;

  const carrying = energyIn(creep.store);
  const room = freeSpaceIn(creep.store);

  // Top up first, then deliver. Deliver early if the containers are dry.
  if (room > 0 && carrying < creep.store.getCapacity(RESOURCE_ENERGY)!) {
    const stocked = w.containers.filter(c => energyIn(c.store) > 0);
    const target = stocked.length ? creep.findClosestByPath(stocked) : undefined;
    if (target) {
      if (creep.withdraw(target, RESOURCE_ENERGY) !== 0) creep.moveTo(target);
      return;
    }
    if (carrying === 0) return; // nothing to fetch, nothing to deliver
  }

  const sinks = [...w.myExtensions.filter(e => freeSpaceIn(e.store) > 0), w.mySpawn].filter(
    s => freeSpaceIn(s.store) > 0,
  );
  const sink = sinks.length ? creep.findClosestByPath(sinks) : w.mySpawn;
  if (creep.transfer(sink, RESOURCE_ENERGY) !== 0) creep.moveTo(sink);
}

/**
 * Attackers hold near our spawn until the squad is big enough, then commit to
 * the enemy spawn. Anything threatening our own spawn preempts that.
 */
export function runAttacker(creep: Creep, committed: boolean, rally: StructureSpawn): void {
  const w = world();

  const threats = w.enemyCreeps.filter(e => getRange(e, rally) <= DEFEND_RADIUS);
  if (threats.length > 0) {
    engage(creep, creep.findClosestByPath(threats));
    return;
  }

  if (!committed) {
    // Loose formation around the spawn: close enough to defend, not blocking it.
    if (getRange(creep, rally) > 5) creep.moveTo(rally);
    return;
  }

  // Clear creeps that get in the way on the push, then hit the spawn.
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
