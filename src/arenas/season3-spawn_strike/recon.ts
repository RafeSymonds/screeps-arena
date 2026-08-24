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
import { getObjectsByPrototype } from 'game/utils';
import { arenaInfo } from 'game';
import { hitsOf } from '../../lib/combat';
import type { World } from '../../lib/world';

/**
 * The arena's contents are generated server-side and are in neither the client
 * bundle nor the docs, so the first tick prints a full inventory to the client
 * console. The layout below is what a real match showed; the code never assumes
 * it, but the report makes it cheap to notice if a match ever differs.
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

  for (const [label, prototype] of PROTOTYPES) {
    const objects = getObjectsByPrototype(prototype);
    if (objects.length === 0) continue;

    const owned = objects.filter(o => (o as { my?: boolean }).my === true).length;
    const hostile = objects.filter(o => (o as { my?: boolean }).my === false).length;
    const neutral = objects.length - owned - hostile;
    console.log(
      `${label}: ${objects.length} (mine ${owned}, enemy ${hostile}, neutral ${neutral})`,
    );

    // Positions matter for the handful of things strategy hinges on.
    if (label === 'spawn' || label === 'flag') {
      for (const o of objects) {
        const side = (o as { my?: boolean }).my;
        const owner = side === true ? 'mine' : side === false ? 'enemy' : 'neutral';
        console.log(`  ${label} ${owner} ${at(o)}${store(o)}`);
      }
    }
  }
}

/** Print the shape of the fight periodically so a replay can be read back. */
export function reportProgress(w: World): void {
  const flags = w.flags
    .map(f => `${at(f)}${f.my === true ? '+' : f.my === false ? '-' : '?'}`)
    .join(' ');
  console.log(
    `t${w.tick} energy=${w.energyAvailable} army=${w.myCreeps.length}v${w.enemyCreeps.length} ` +
      `ramparts=${w.myRamparts.length}/${w.ramparts.length} flags=${flags} ` +
      `mySpawn=${hitsOf(w.mySpawn)} enemySpawn=${hitsOf(w.enemySpawn)}`,
  );
}
