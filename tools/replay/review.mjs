// Look at finished matches: what was cached, what happened, and what the bot
// was thinking. See tools/replay/README.md.
//
//   node tools/replay/review.mjs                    list cached games
//   node tools/replay/review.mjs <id|latest|loss>   review one
import { collectGames, outcomeOf, sideFromLog } from './cache.mjs';

const ATTACK_POWER = 30;
const RANGED_ATTACK_POWER = 10;
const HEAL_POWER = 12;

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const target = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);

const games = collectGames();
if (games.length === 0) {
  console.error(
    'No games in the archive or the client cache.\n' +
      "Run 'bin/arena fetch' with the client open, or scrub a replay in the client, then try again.",
  );
  process.exit(1);
}

const opponentOf = (record, you) =>
  record?.users?.map(u => u.username).find(name => name !== you) ?? '?';
const youOf = record => record?.users?.find(u => u._id === record.user)?.username ?? 'you';

function summarise(game) {
  const record = game.record;
  const you = youOf(record);
  return {
    id: game.id,
    when: record?.game?.createdAt?.replace('T', ' ').slice(0, 16) ?? '?',
    outcome: outcomeOf(record),
    ticks: record?.game?.meta?.ticks ?? game.frames.at(-1)?.gameTime ?? 0,
    you,
    side: sideFromLog(game) ?? '?',
    opponent: opponentOf(record, you),
    version: record?.codes?.find(c => c.user === record.user)?.version,
    rating: record?.ratingHistory,
    replay: game.frames.length,
    logs: game.logs.length,
  };
}

if (!target) {
  console.log('archived and cached games (newest first)\n');
  console.log('id                        when              result  ticks  side      opponent           replay');
  for (const game of games) {
    const s = summarise(game);
    const rating = s.rating?.rating !== undefined ? ` ${s.rating.previousRating}->${s.rating.rating}` : '';
    console.log(
      `${s.id}  ${s.when}  ${s.outcome.padEnd(6)}  ${String(s.ticks).padStart(5)}  ` +
        `${s.side.padEnd(8)}  ${s.opponent.padEnd(18)} ${String(s.replay).padStart(4)} frames${rating}`,
    );
  }
  console.log(
    '\nreview one with:  bin/arena review <id>   (or `latest`, or `loss` for the newest loss)',
  );
  console.log("a game with 0 frames is cache-only and was never opened — 'bin/arena fetch <id>' gets all of it.");
  process.exit(0);
}

const game =
  target === 'latest'
    ? games[0]
    : target === 'loss'
      ? games.find(g => outcomeOf(g.record) === 'loss')
      : games.find(g => g.id === target || g.id.startsWith(target));
if (!game) {
  console.error(`No cached game matching "${target}". Run without arguments to list them.`);
  process.exit(1);
}

const s = summarise(game);
const you = s.side;
const foe = you === 'player1' ? 'player2' : 'player1';
const step = Number(flag('step', 25));

console.log(`${s.id}   ${s.when}   ${s.outcome.toUpperCase()} after ${s.ticks} ticks`);
console.log(`${s.you}${s.version ? ` v${s.version}` : ''} as ${you}  vs  ${s.opponent}`);
if (s.rating?.rating !== undefined) {
  console.log(`rating ${s.rating.previousRating} -> ${s.rating.rating}${s.rating.calibrating ? ' (calibrating)' : ''}`);
}

if (game.logs.length > 0) {
  console.log('\n--- your bot\'s console output ---');
  for (const line of game.logs) {
    console.log(line.text.split('\n').map((l, i) => (i === 0 ? `t${String(line.tick).padStart(4)}  ${l}` : `       ${l}`)).join('\n'));
  }
}

if (game.frames.length === 0) {
  console.log(`\nNo replay frames — run 'bin/arena fetch ${game.id}' with the client open.`);
  process.exit(0);
}

const livePower = creep => {
  let melee = 0;
  let ranged = 0;
  let heal = 0;
  for (const part of creep.body) {
    if (part.hits <= 0) continue;
    if (part.type === 'attack') melee += ATTACK_POWER;
    if (part.type === 'ranged_attack') ranged += RANGED_ATTACK_POWER;
    if (part.type === 'heal') heal += HEAL_POWER;
  }
  return { damage: melee + ranged, heal };
};

console.log('\n--- how it went ---');
console.log('tick  spawn you/foe   dps you/foe  heal  your creeps                          enemy creeps');
for (const frame of game.frames) {
  const last = frame.gameTime === game.frames.at(-1).gameTime;
  if (frame.gameTime % step !== 0 && !last) continue;
  const creeps = frame.objects.filter(o => o.prototypeName === 'Creep' && !o.spawning);
  const spawns = frame.objects.filter(o => o.prototypeName === 'StructureSpawn');
  const side = who => creeps.filter(c => c.user === who);
  const dps = list => list.reduce((t, c) => t + livePower(c).damage, 0);
  const hps = list => list.reduce((t, c) => t + livePower(c).heal, 0);
  const hp = who => spawns.find(x => x.user === who)?.hits ?? 0;
  const shape = list =>
    list
      .sort((a, b) => b.body.length - a.body.length)
      .map(c => `${c.body.filter(p => p.hits > 0).length}p(${c.x},${c.y})`)
      .join(' ') || '-';
  console.log(
    `${String(frame.gameTime).padStart(4)}  ${String(hp(you)).padStart(4)}/${String(hp(foe)).padEnd(5)}  ` +
      `${String(dps(side(you))).padStart(6)}/${String(dps(side(foe))).padEnd(5)} ${String(hps(side(you))).padStart(4)}  ` +
      `${shape(side(you)).padEnd(36)} ${shape(side(foe))}`,
  );
}

// The opponent's best creep is the most useful single thing to copy from.
const finalFrame = game.frames.at(-1);
const best = finalFrame.objects
  .filter(o => o.prototypeName === 'Creep' && o.user === foe)
  .sort((a, b) => b.body.length - a.body.length)[0];
if (best) {
  const counts = {};
  for (const part of best.body) counts[part.type] = (counts[part.type] ?? 0) + 1;
  const COST = { move: 50, work: 100, carry: 50, attack: 80, ranged_attack: 150, heal: 250, tough: 10 };
  const price = Object.entries(counts).reduce((t, [type, n]) => t + COST[type] * n, 0);
  console.log(
    `\nopponent's biggest creep: ${best.body.length} parts, ${price} energy — ` +
      Object.entries(counts).map(([type, n]) => `${n} ${type}`).join(', '),
  );
}
