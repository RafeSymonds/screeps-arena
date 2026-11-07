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
import { archiveGame } from './games.mjs';
import { ARCHIVE_DIR } from '../replay/archive.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const valued = new Set(['--arena', '--arena-id']);
const ids = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
const ARENA = flag('arena');
const FORCE = argv.includes('--force');

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

async function archiveAll(targets, arenaId) {
  for (const id of targets) {
    try {
      console.log(`  ${id}  ${await archiveGame(api, id, { arenaId, force: FORCE })}`);
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
      const targets = (games ?? []).map(g => g.game?._id ?? g._id).filter(Boolean);
      console.log(`${arenaLabel(arena)}: ${targets.length} recent games`);
      await archiveAll(targets, arena._id);
    }
  }
  console.log(`\narchive: ${ARCHIVE_DIR}`);
} finally {
  client.close();
}
