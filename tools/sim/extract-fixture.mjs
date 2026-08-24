// Rebuild tools/sim/fixtures/<arena>.json from the game client's HTTP cache.
//
// Arena contents are generated server-side and are in neither the client bundle
// nor the docs, but the client's Chromium cache keeps what it fetched: the game
// record (terrain + result) and whole replays (every object, per tick). This
// distils one of those into the starting position the simulator plays from.
//
// Usage: node tools/sim/extract-fixture.mjs [outfile]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const CACHE =
  process.env.ARENA_CACHE_DIR ||
  path.join(homedir(), 'Library/Application Support/screeps_arena/Cache/Cache_Data');

/** Skip the gzip header, including whatever optional fields FLG announces. */
function deflateStart(buf, at) {
  // Most entries in this cache are images, and 1f 8b turns up inside them by
  // chance, so every step is bounded rather than trusting the header.
  if (buf[at + 2] !== 8) return -1;
  const flags = buf[at + 3];
  let p = at + 10;
  if (flags & 4) {
    if (p + 2 > buf.length) return -1;
    p += 2 + buf.readUInt16LE(p);
  }
  for (const flag of [8, 16]) {
    if (!(flags & flag)) continue;
    while (p < buf.length && buf[p] !== 0) p += 1;
    p += 1;
  }
  if (flags & 2) p += 2;
  return p < buf.length ? p : -1;
}

/**
 * Cache entries hold the request URL as plain text, then a gzip body followed by
 * Chromium's own trailer. `gunzipSync` refuses the whole thing because of that
 * trailer, so the header is skipped by hand and the deflate stream is inflated
 * raw — which also copes with the cache having truncated the body.
 */
function readEntry(file) {
  const raw = readFileSync(file);
  const url = raw
    .subarray(0, 800)
    .toString('latin1')
    .match(/https:\/\/\S+/)?.[0];
  if (!url) return null;
  const magic = raw.indexOf(Buffer.from([0x1f, 0x8b]));
  if (magic < 0) return null;
  const start = deflateStart(raw, magic);
  if (start < 0) return null;
  let body;
  try {
    body = zlib.inflateRawSync(raw.subarray(start), {
      finishFlush: zlib.constants.Z_SYNC_FLUSH,
    });
  } catch {
    return null;
  }
  return { url: url.replace(/[^\x20-\x7e].*$/, ''), body: body.toString('utf8') };
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const games = new Map();
const replays = new Map();

for (const name of readdirSync(CACHE)) {
  if (!name.endsWith('_0')) continue;
  const file = path.join(CACHE, name);
  // Cheap URL sniff first: the cache is mostly megabytes of artwork.
  const head = readFileSync(file).subarray(0, 800).toString('latin1');
  if (!head.includes('/api/game/')) continue;
  const entry = readEntry(file);
  if (!entry) continue;
  const replay = entry.url.match(/\/api\/game\/([a-f0-9]+)\/replay\//);
  if (replay) {
    const frames = parse(entry.body);
    if (Array.isArray(frames) && frames[0]?.objects) replays.set(replay[1], frames[0]);
    continue;
  }
  const game = entry.url.match(/\/api\/game\/([a-f0-9]+)$/);
  if (game) {
    const doc = parse(entry.body);
    if (doc?.game?.game?.terrain) games.set(game[1], doc.game.game);
  }
}

const id = [...replays.keys()].find(key => games.has(key));
if (!id) {
  console.error(
    `No cached game with a matching replay found in ${CACHE}.\n` +
      `Play a ranked match, open its replay in the client, then run this again.`,
  );
  process.exit(1);
}

const game = games.get(id);
const frame = replays.get(id);

/**
 * Wind the frame back to tick zero: drop the creeps that had been built, refill
 * the energy that had been spent, and hand the ramparts and flags back to
 * nobody. Everything else on this map is static for the whole match.
 */
const KEEP = {
  // `owned` decides whether the object keeps the owner it had in the replay.
  // Ramparts and flags must not: the frame is from the middle of a match, where
  // one player already held them, and baking that in hands them the centre for
  // free from tick one.
  StructureExtension: { owned: true, extra: { store: 100, capacity: 100 } },
  StructureSpawn: { owned: true, extra: { store: 1000, capacity: 1000 } },
  StructureRampart: { owned: false, extra: {} },
  StructureWall: { owned: false, extra: {} },
  Flag: { owned: false, extra: {} },
};

const objects = [];
for (const o of frame.objects) {
  const spec = KEEP[o.prototypeName];
  if (!spec) continue;
  objects.push({
    type: o.prototypeName,
    x: o.x,
    y: o.y,
    ...(spec.owned && o.user ? { user: o.user } : {}),
    // Ramparts name the flag that controls them; flags name their own group.
    ...(o.controlledBy ? { group: o.controlledBy } : {}),
    ...(o.prototypeName === 'Flag' ? { group: o._id } : {}),
    ...(o.hitsMax ? { hits: o.hitsMax } : {}),
    ...spec.extra,
  });
}
objects.sort((a, b) => a.y - b.y || a.x - b.x || a.type.localeCompare(b.type));

const out = process.argv[2] ?? 'tools/sim/fixtures/spawn-strike.json';
writeFileSync(
  out,
  `${JSON.stringify(
    {
      note:
        'Distilled from a real match by tools/sim/extract-fixture.mjs. Structure ' +
        'positions are fixed for this arena; the terrain is generated per match, ' +
        'so this is one sample of it, not the map.',
      game: id,
      size: 100,
      terrain: game.terrain,
      objects,
    },
    null,
    0,
  )}\n`,
);

const counts = {};
for (const o of objects) counts[o.type] = (counts[o.type] ?? 0) + 1;
console.log(`wrote ${out} from game ${id}`);
console.log(`  terrain ${game.terrain.length} tiles, objects:`, counts);
