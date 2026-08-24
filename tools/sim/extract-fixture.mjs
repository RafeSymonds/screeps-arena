// Rebuild tools/sim/fixtures/<arena>.json from the game client's HTTP cache.
//
// Usage: node tools/sim/extract-fixture.mjs [outfile]
import { writeFileSync } from 'node:fs';
import { collectGames } from '../replay/cache.mjs';

const KEEP = new Set([
  'StructureExtension',
  'StructureSpawn',
  'StructureRampart',
  'StructureWall',
  'Flag',
]);

const games = collectGames().filter(g => g.record && g.frames.length > 0);
if (games.length === 0) {
  console.error(
    'No cached game with a replay found. Play a match, open its replay in the\n' +
      'client and scrub it, then run this again. Override the cache location\n' +
      'with ARENA_CACHE_DIR.',
  );
  process.exit(1);
}

/**
 * Prefer a genuine tick-0 frame. A mid-match frame can be wound back for energy,
 * but not for who owns what: the flags and their rampart groups start one to a
 * side, and a later frame will have had them traded. Getting that wrong made
 * every simulated match start with the centre already decided.
 */
const withZero = games.find(g => g.frames.some(f => f.gameTime === 0));
const game = withZero ?? games[0];
const frame = game.frames.find(f => f.gameTime === 0) ?? game.frames[0];
if (!withZero) {
  console.warn(
    `warning: no tick-0 frame cached; using tick ${frame.gameTime} of ${game.id}.\n` +
      '         Ownership and energy in this fixture may not be the true opening.',
  );
}

const objects = frame.objects
  .filter(o => KEEP.has(o.prototypeName))
  .map(o => ({
    type: o.prototypeName,
    x: o.x,
    y: o.y,
    ...(o.user ? { user: o.user } : {}),
    // Ramparts name the flag that controls them; flags name their own group.
    ...(o.controlledBy ? { group: o.controlledBy } : {}),
    ...(o.prototypeName === 'Flag' ? { group: o._id } : {}),
    ...(o.hitsMax ? { hits: o.hitsMax } : {}),
    ...(o.store?.energy === undefined
      ? {}
      : { store: o.store.energy, capacity: o.storeCapacityResource?.energy ?? o.store.energy }),
  }))
  .sort((a, b) => a.y - b.y || a.x - b.x || a.type.localeCompare(b.type));

const out = process.argv[2] ?? 'tools/sim/fixtures/spawn-strike.json';
writeFileSync(
  out,
  `${JSON.stringify({
    note:
      `Tick ${frame.gameTime} of game ${game.id}, via tools/sim/extract-fixture.mjs. ` +
      'Structure positions are fixed for this arena; the terrain is generated per ' +
      'match, so this is one sample of it, not the map.',
    game: game.id,
    tick: frame.gameTime,
    size: 100,
    terrain: game.record.game.terrain,
    objects,
  })}\n`,
);

const counts = {};
for (const o of objects) counts[`${o.type}${o.user ? `/${o.user}` : '/neutral'}`] = (counts[`${o.type}${o.user ? `/${o.user}` : '/neutral'}`] ?? 0) + 1;
console.log(`wrote ${out} from game ${game.id} tick ${frame.gameTime}`);
for (const [key, n] of Object.entries(counts).sort()) console.log(`  ${key}: ${n}`);
const spawn = objects.find(o => o.type === 'StructureSpawn');
console.log(`  spawn energy: ${spawn?.store}/${spawn?.capacity}`);
