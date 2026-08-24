import { RESOURCE_ENERGY } from 'game/constants';
import {
  ConstructionSite,
  Creep,
  Flag,
  Resource,
  Source,
  StructureContainer,
  StructureExtension,
  StructureRampart,
  StructureRoad,
  StructureSpawn,
  StructureTower,
  StructureWall,
} from 'game/prototypes';
import type { GameObject } from 'game/prototypes';
import { getObjectsByPrototype, getTicks } from 'game/utils';
import { arenaInfo } from 'game';

/**
 * What is actually on this map is not documented anywhere and is not in the
 * game client — the arena is generated server-side. So the first tick prints a
 * full inventory to the client console. Read it once, then tune the strategy
 * against facts instead of guesses.
 */
const PROTOTYPES = [
  ['spawn', StructureSpawn],
  ['creep', Creep],
  ['source', Source],
  ['container', StructureContainer],
  ['extension', StructureExtension],
  ['tower', StructureTower],
  ['rampart', StructureRampart],
  ['wall', StructureWall],
  ['road', StructureRoad],
  ['constructionSite', ConstructionSite],
  ['flag', Flag],
  ['resource', Resource],
] as const;

const at = (o: GameObject) => `(${o.x},${o.y})`;

function store(o: unknown): string {
  const s = (
    o as {
      store?: {
        getUsedCapacity(r?: string): number | null;
        getCapacity(r?: string): number | null;
      };
    }
  ).store;
  if (!s) return '';
  return ` energy=${s.getUsedCapacity(RESOURCE_ENERGY) ?? 0}/${s.getCapacity(RESOURCE_ENERGY) ?? 0}`;
}

export function reportArena(): void {
  console.log(
    `=== arena: ${arenaInfo.name} | season ${arenaInfo.season} | level ${arenaInfo.level} ` +
      `| ticksLimit ${arenaInfo.ticksLimit} | cpu ${arenaInfo.cpuTimeLimit}ns ` +
      `(first tick ${arenaInfo.cpuTimeLimitFirstTick}ns) ===`,
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [label, prototype] of PROTOTYPES) {
    const objects = getObjectsByPrototype(prototype);
    for (const o of objects) {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x);
      maxY = Math.max(maxY, o.y);
    }
    if (objects.length === 0) continue;

    const owned = objects.filter(o => (o as { my?: boolean }).my === true).length;
    const hostile = objects.filter(o => (o as { my?: boolean }).my === false).length;
    const neutral = objects.length - owned - hostile;
    console.log(
      `${label}: ${objects.length} (mine ${owned}, enemy ${hostile}, neutral ${neutral})`,
    );

    // Positions matter for the handful of things strategy hinges on.
    if (label === 'spawn' || label === 'source' || label === 'container' || label === 'flag') {
      for (const o of objects) {
        const side = (o as { my?: boolean }).my;
        const owner = side === true ? 'mine' : side === false ? 'enemy' : 'neutral';
        const energy = label === 'source' ? ` energy=${(o as Source).energy}` : store(o);
        console.log(`  ${label} ${owner} ${at(o)}${energy}`);
      }
    }
  }

  console.log(`object extent: x ${minX}..${maxX}, y ${minY}..${maxY}`);
}

/** Print the shape of the fight periodically so a replay can be read back. */
export function reportProgress(mySpawnHits: number, enemySpawnHits: number, army: number): void {
  console.log(
    `t${getTicks()} army=${army} mySpawn=${mySpawnHits}hp enemySpawn=${enemySpawnHits}hp`,
  );
}
