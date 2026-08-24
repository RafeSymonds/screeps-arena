import { RESOURCE_ENERGY } from 'game/constants';
import {
  Creep,
  Source,
  StructureContainer,
  StructureExtension,
  StructureSpawn,
  StructureTower,
} from 'game/prototypes';
import { getObjectsByPrototype, getTicks } from 'game/utils';

/**
 * Everything worth querying once per tick. `getObjectsByPrototype` walks the
 * whole object list, so calling it ad hoc from creep logic gets expensive fast.
 */
export interface World {
  tick: number;
  mySpawn: StructureSpawn | undefined;
  enemySpawn: StructureSpawn | undefined;
  myCreeps: Creep[];
  enemyCreeps: Creep[];
  myTowers: StructureTower[];
  myExtensions: StructureExtension[];
  containers: StructureContainer[];
  sources: Source[];
  /** Energy sitting in the spawn plus every extension. */
  storedEnergy: number;
}

let cache: World | undefined;

export function world(): World {
  const tick = getTicks();
  if (cache && cache.tick === tick) return cache;

  const spawns = getObjectsByPrototype(StructureSpawn);
  const creeps = getObjectsByPrototype(Creep);
  const extensions = getObjectsByPrototype(StructureExtension).filter(e => e.my);
  const mySpawn = spawns.find(s => s.my);

  cache = {
    tick,
    mySpawn,
    enemySpawn: spawns.find(s => !s.my),
    myCreeps: creeps.filter(c => c.my && !c.spawning),
    enemyCreeps: creeps.filter(c => !c.my),
    myTowers: getObjectsByPrototype(StructureTower).filter(t => t.my),
    myExtensions: extensions,
    containers: getObjectsByPrototype(StructureContainer),
    sources: getObjectsByPrototype(Source),
    storedEnergy:
      (mySpawn?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) +
      extensions.reduce((sum, e) => sum + (e.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0), 0),
  };
  return cache;
}

export function energyIn(store: { getUsedCapacity(r?: string): number | null }): number {
  return store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
}

export function freeSpaceIn(store: { getFreeCapacity(r?: string): number | null }): number {
  return store.getFreeCapacity(RESOURCE_ENERGY) ?? 0;
}
