import { RESOURCE_ENERGY } from 'game/constants';
import {
  Creep,
  Flag,
  StructureExtension,
  StructureRampart,
  StructureSpawn,
  StructureWall,
} from 'game/prototypes';
import { getObjectsByPrototype, getRange, getTicks } from 'game/utils';

/** `spawnCreep` may draw energy from extensions within this range of the spawn. */
export const SPAWN_RANGE = 20;

/**
 * Everything worth querying once per tick. `getObjectsByPrototype` walks the
 * whole object list, so calling it ad hoc from creep logic gets expensive fast.
 */
export interface World {
  tick: number;
  mySpawn: StructureSpawn | undefined;
  enemySpawn: StructureSpawn | undefined;
  /** Both spawns, whoever owns them — they are obstacles either way. */
  spawns: StructureSpawn[];
  myCreeps: Creep[];
  enemyCreeps: Creep[];
  /** The two capture flags in the central keep. */
  flags: Flag[];
  ramparts: StructureRampart[];
  myRamparts: StructureRampart[];
  /** The walls sealing the two flank passages. */
  walls: StructureWall[];
  extensions: StructureExtension[];
  myExtensions: StructureExtension[];
  enemyExtensions: StructureExtension[];
  /** Ids of every creep we own, including ones still in the spawn. */
  myCreepIds: Set<string>;
  /** Energy `spawnCreep` can actually reach right now. */
  energyAvailable: number;
}

let cache: World | undefined;

export function world(): World {
  const tick = getTicks();
  if (cache && cache.tick === tick) return cache;

  const spawns = getObjectsByPrototype(StructureSpawn);
  const creeps = getObjectsByPrototype(Creep);
  const ramparts = getObjectsByPrototype(StructureRampart);
  const extensions = getObjectsByPrototype(StructureExtension);
  const mySpawn = spawns.find(s => s.my);
  const myExtensions = extensions.filter(e => e.my === true);

  let energyAvailable = mySpawn ? energyIn(mySpawn.store) : 0;
  if (mySpawn) {
    for (const e of myExtensions) {
      if (getRange(mySpawn, e) <= SPAWN_RANGE) energyAvailable += energyIn(e.store);
    }
  }

  cache = {
    tick,
    mySpawn,
    enemySpawn: spawns.find(s => s.my === false),
    spawns,
    myCreeps: creeps.filter(c => c.my && !c.spawning),
    enemyCreeps: creeps.filter(c => !c.my && !c.spawning),
    flags: getObjectsByPrototype(Flag),
    ramparts,
    myRamparts: ramparts.filter(r => r.my === true),
    walls: getObjectsByPrototype(StructureWall),
    extensions,
    myExtensions,
    enemyExtensions: extensions.filter(e => e.my === false),
    myCreepIds: new Set(creeps.filter(c => c.my).map(c => String(c.id))),
    energyAvailable,
  };
  return cache;
}

export function energyIn(store: { getUsedCapacity(r?: string): number | null }): number {
  return store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
}

export function freeSpaceIn(store: { getFreeCapacity(r?: string): number | null }): number {
  return store.getFreeCapacity(RESOURCE_ENERGY) ?? 0;
}
