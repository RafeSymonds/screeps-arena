// Play the built bundle on the real arena server in test mode (unrated) against
// every saved test opponent, archive each game, and print the results.
//
//   node tools/client/test.mjs                          season4-pain_and_gain, all opponents, once
//   node tools/client/test.mjs --arena season3-spawn_strike --repeat 3
//   node tools/client/test.mjs --opponent System        opponents whose name contains this
//   node tools/client/test.mjs --list                   show the opponents and stop
//
// Uploads dist/<arena>/main.mjs, so build first (bin/arena test does).
// Needs the client running with a debug port. See tools/client/README.md.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { connect } from './cdp.mjs';
import { allArenas, archiveGame } from './games.mjs';
import { zip } from './zip.mjs';
import { outcomeOf } from '../replay/cache.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const ARENA = flag('arena', 'season4-pain_and_gain');
const REPEAT = Number(flag('repeat', 1));
const OPPONENT = flag('opponent');
const POLL_MS = 5000;
const TIMEOUT_MS = 20 * 60 * 1000;

const bundle = path.resolve(`dist/${ARENA}/main.mjs`);
if (!argv.includes('--list') && !existsSync(bundle)) {
  console.error(`No bundle at ${bundle}. Run 'bin/arena build ${ARENA}' first.`);
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const client = await connect();
const { api } = client;

try {
  const arena = (await allArenas(api)).find(a => a.folderName === ARENA);
  if (!arena) throw new Error(`No arena with folder name ${ARENA}`);

  // Saved test opponents come in three lists: the arena's built-in bot(s),
  // opponents from your recent rated games, and ones saved with Test Tokens.
  const lists = await api(`/test/codes/${arena._id}`);
  const opponents = [];
  for (const kind of ['system', 'recent', 'favorites']) {
    for (const entry of lists[kind] ?? []) {
      const name = entry.user?.username ?? '?';
      if (OPPONENT && !name.toLowerCase().includes(OPPONENT.toLowerCase())) continue;
      opponents.push({ kind, name, codeId: entry.code?._id, note: entry.note });
    }
  }
  console.log(`${ARENA}: ${opponents.length} test opponent(s)`);
  for (const o of opponents)
    console.log(
      `  ${o.kind.padEnd(9)} ${o.name}  code ${o.codeId}${o.note ? `  "${o.note}"` : ''}`,
    );
  if (argv.includes('--list') || opponents.length === 0) process.exit(0);

  const code = zip({ 'main.mjs': readFileSync(bundle) }).toString('base64');
  const results = [];

  for (const opponent of opponents) {
    for (let run = 1; run <= REPEAT; run += 1) {
      const label = `${opponent.name}${REPEAT > 1 ? ` #${run}` : ''}`;
      const started = await api('/test/start', {
        method: 'POST',
        form: {
          arena: arena._id,
          code: { base64: code, type: 'application/zip', name: 'blob' },
          codeId: opponent.codeId,
        },
      });
      const id = started?.game?._id ?? started?.gameId ?? started?._id;
      if (!id)
        throw new Error(`test/start gave no game id: ${JSON.stringify(started).slice(0, 300)}`);
      process.stdout.write(`${label}: game ${id} `);

      // Games queue, run, then finish; poll the record until it has a result.
      const deadline = Date.now() + TIMEOUT_MS;
      let record;
      let last;
      for (;;) {
        ({ game: record } = await api(`/game/${id}`));
        const status = record?.game?.status ?? record?.status;
        if (status !== last) process.stdout.write(`${status} `);
        last = status;
        if (status === 'finished' || status === 'error' || status === 'cancelled') break;
        if (Date.now() > deadline)
          throw new Error(`game ${id} still ${status} after ${TIMEOUT_MS / 60000} min`);
        await sleep(POLL_MS);
      }
      const archivedAs = await archiveGame(api, id, {
        arenaId: arena._id,
        force: true,
        extra: { test: { opponent: opponent.name, codeId: opponent.codeId } },
      });
      const outcome = outcomeOf(record);
      const ticks = record?.game?.meta?.ticks ?? '?';
      console.log(`-> ${outcome} at t${ticks} (${archivedAs})`);
      results.push({ label, id, outcome, ticks });
    }
  }

  console.log('\nopponent                  result   ticks  game');
  for (const r of results)
    console.log(
      `${r.label.padEnd(25)} ${r.outcome.padEnd(8)} ${String(r.ticks).padStart(5)}  ${r.id}`,
    );
  const wins = results.filter(r => r.outcome === 'win').length;
  console.log(`\n${wins}/${results.length} won.  bin/arena review <game> for detail.`);
} finally {
  client.close();
}
