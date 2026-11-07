// Archive finished matches straight from the arena API: the game record, every
// replay frame and your bot's console output. Unlike the client's HTTP cache,
// this needs nobody to scrub a replay first, and the archive does not evict.
//
//   node tools/client/fetch.mjs                  recent games, every unlocked current-season arena
//   node tools/client/fetch.mjs --arena spawn_strike   one arena (any season)
//   node tools/client/fetch.mjs <game-id> ...    specific games
//   options: --arena <folder-name substring>  --arena-id <id>  --force
//
// Needs the client running with a debug port. See tools/client/README.md.
import { connect } from './cdp.mjs';
import { ARCHIVE_DIR, archived, writeArchive } from '../replay/archive.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const valued = new Set(['--arena', '--arena-id']);
const ids = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
const ARENA = flag('arena');
const FORCE = argv.includes('--force');

// The client fetches replays and logs in chunks named by their last tick:
// tick 0 alone, then 1-100 as "100", 101-200 as "200", ... up to the end.
const CHUNK = 100;
const chunkEnds = ticks => {
  const ends = [0];
  for (let end = CHUNK; end < ticks; end += CHUNK) ends.push(end);
  if (ticks > 0) ends.push(ticks);
  return ends;
};
const chunkStart = end => Math.floor((end - 1) / CHUNK) * CHUNK;

const client = await connect();
const { api } = client;

const arenaLabel = arena => arena.folderName ?? arena._id;

/**
 * Which arenas to pull games from: `--arena-id` as given; `--arena` as a
 * substring of the client folder name (`spawn_strike`, `season4-pain_and_gain`)
 * across every season; otherwise every unlocked arena of the current season.
 */
async function resolveArenas() {
  const given = flag('arena-id');
  if (given) return [{ _id: given }];
  if (!ARENA) {
    const { season } = await api('/season/current');
    const { arenas } = await api(`/season/${season._id}/arenas`);
    return (arenas ?? []).filter(a => a.unlocked !== false);
  }
  const { seasons } = await api('/season/list');
  const all = [];
  for (const season of seasons ?? []) {
    const { arenas } = await api(`/season/${season._id}/arenas`);
    all.push(...(arenas ?? []));
  }
  const found = all.filter(a => a.folderName?.includes(ARENA));
  if (found.length === 0) {
    throw new Error(
      `No arena folder matching "${ARENA}". Known:\n  ${all.map(arenaLabel).join('\n  ')}`,
    );
  }
  return found;
}

async function archiveGame(id, arenaId) {
  if (!FORCE && archived(id)) return 'have';
  const { game: record } = await api(`/game/${id}`);
  const ticks = record?.game?.meta?.ticks ?? 0;
  const frames = [];
  const logs = [];
  for (const end of chunkEnds(ticks)) {
    const chunk = await api(`/game/${id}/replay/${end}`);
    if (Array.isArray(chunk)) frames.push(...chunk);
    if (end === 0) continue;
    // Log chunks are indexed by tick relative to the chunk: entry k is tick
    // chunkStart + k, matching the client's own SCAReplayLogService.
    const log = await api(`/game/${id}/log/${end}`).catch(() => null);
    if (!log || typeof log !== 'object') continue;
    for (const [k, text] of Object.entries(log)) {
      if (!text) continue;
      logs.push({
        tick: chunkStart(end) + Number(k),
        text: typeof text === 'string' ? text : JSON.stringify(text),
      });
    }
  }
  frames.sort((a, b) => a.gameTime - b.gameTime);
  writeArchive({ id, arenaId, fetchedAt: new Date().toISOString(), record, frames, logs });
  return `${frames.length} frames, ${logs.length} log lines`;
}

async function archiveAll(targets, arenaId) {
  for (const id of targets) {
    try {
      console.log(`  ${id}  ${await archiveGame(id, arenaId)}`);
    } catch (error) {
      console.log(`  ${id}  FAILED: ${error.message}`);
    }
  }
}

try {
  if (ids.length > 0) {
    await archiveAll(ids, null);
  } else {
    for (const arena of await resolveArenas()) {
      const { games } = await api(`/arena/${arena._id}/last-games`);
      const targets = (games ?? []).map(g => g._id ?? g.game?._id).filter(Boolean);
      console.log(`${arenaLabel(arena)}: ${targets.length} recent games`);
      await archiveAll(targets, arena._id);
    }
  }
  console.log(`\narchive: ${ARCHIVE_DIR}`);
} finally {
  client.close();
}
