// Run a built arena bundle against a scripted opponent on a real arena's
// starting position. See tools/sim/README.md — this is a model of the engine,
// so a clean run is evidence that the bot behaves, never proof that it wins.
//
//   node tools/sim/run.mjs                          full matrix, both sides
//   node tools/sim/run.mjs --opponent rusher        one match
//   node tools/sim/run.mjs --opponent blob --side 2 --trace
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

import { buildWorld, beginTick, endTick, P, state } from './engine.mjs';
import { STYLES, create } from './opponents.mjs';
import { stats } from './stubs/path-finder.mjs';

// Must happen before the bundle is imported, and the import must be dynamic so
// it resolves after the hook is in place.
register('./hooks.mjs', import.meta.url);

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const has = name => argv.includes(`--${name}`);

const ARENA = flag('arena', 'season3-spawn_strike');
const FIXTURE = flag('fixture', 'spawn-strike');
const TICKS = Number(flag('ticks', 2000));
const TRACE = has('trace');
const EVERY = Number(flag('every', 25));

const bundle = path.resolve(`dist/${ARENA}/main.mjs`);
if (!existsSync(bundle)) {
  console.error(`No bundle at ${bundle} — run 'bin/arena build ${ARENA}' first.`);
  process.exit(1);
}

/** Module state persists inside a bundle, so each match needs a fresh import. */
async function loadBot(run) {
  return import(`${pathToFileURL(bundle).href}?run=${run}`);
}

let run = 0;

async function play({ opponentStyle, side, trace }) {
  const me = side === 2 ? 'player2' : 'player1';
  const foe = side === 2 ? 'player1' : 'player2';
  buildWorld(FIXTURE, me);
  const opponent = create(foe, opponentStyle);
  const bot = await loadBot(run++);

  const mine = cls => state.objects.filter(o => o instanceof cls && o.owner === me);
  const foes = cls => state.objects.filter(o => o instanceof cls && o.owner === foe);
  const live = side =>
    state.objects.filter(o => o instanceof P.Creep && !o.spawning && o.owner === side);

  const quiet = console.log;
  const cost = [];
  let result = 'draw';
  let crash;

  for (let i = 0; i < TICKS; i += 1) {
    beginTick();
    const before = stats.calls;
    const started = process.hrtime.bigint();
    if (!trace) console.log = () => {};
    try {
      bot.loop();
    } catch (error) {
      crash = { tick: state.tick, error };
      console.log = quiet;
      break;
    } finally {
      console.log = quiet;
    }
    cost.push([Number(process.hrtime.bigint() - started) / 1e6, stats.calls - before]);
    opponent();
    endTick();

    if (trace) for (const event of state.events.splice(0)) console.log(`  ${event}`);
    if (trace && state.tick % EVERY === 0) {
      const show = list => list.map(c => `#${c.id}[${c.body.length}](${c.x},${c.y})`).join(' ');
      console.log(`  t${state.tick} me: ${show(live(me))}`);
      console.log(`  t${state.tick} op: ${show(live(foe))}`);
    }

    if (foes(P.StructureSpawn).length === 0) {
      result = 'win';
      break;
    }
    if (mine(P.StructureSpawn).length === 0) {
      result = 'loss';
      break;
    }
  }

  const flags = state.objects.filter(o => o instanceof P.Flag);
  const ramparts = state.objects.filter(o => o instanceof P.StructureRampart);
  const times = cost.map(c => c[0]).sort((a, b) => a - b);
  return {
    result,
    crash,
    tick: state.tick,
    mySpawn: mine(P.StructureSpawn)[0]?.hits ?? 0,
    foeSpawn: foes(P.StructureSpawn)[0]?.hits ?? 0,
    flags: flags.filter(f => f.owner === me).length,
    ramparts: ramparts.filter(r => r.owner === me).length,
    foeExtensions: foes(P.StructureExtension).length,
    creeps: `${live(me).length}v${live(foe).length}`,
    maxMs: times.length ? times[times.length - 1] : 0,
    p95Ms: times.length ? times[Math.floor(times.length * 0.95)] : 0,
    searches: cost.length ? cost.reduce((s, c) => s + c[1], 0) / cost.length : 0,
  };
}

const styles = has('opponent') ? [flag('opponent')] : Object.keys(STYLES);
const sides = has('side') ? [Number(flag('side'))] : [1, 2];
const single = styles.length === 1 && sides.length === 1;

console.log(`arena ${ARENA} · fixture ${FIXTURE} · ${TICKS} ticks\n`);
let failures = 0;

for (const opponentStyle of styles) {
  for (const side of sides) {
    const outcome = await play({ opponentStyle, side, trace: TRACE && single });
    if (outcome.crash) {
      failures += 1;
      console.log(`${opponentStyle} as player${side}: CRASHED on tick ${outcome.crash.tick}`);
      console.log(outcome.crash.error);
      continue;
    }
    if (outcome.result !== 'win') failures += 1;
    const verdict = { win: 'win ', loss: 'LOSS', draw: 'DRAW' }[outcome.result];
    console.log(
      `${opponentStyle.padEnd(7)} player${side}  ${verdict}  t${String(outcome.tick).padStart(4)}  ` +
        `spawn ${String(outcome.mySpawn).padStart(4)}/${String(outcome.foeSpawn).padEnd(4)}  ` +
        `flags ${outcome.flags}/2  ramparts ${String(outcome.ramparts).padStart(3)}  ` +
        `foe ext ${String(outcome.foeExtensions).padStart(2)}  creeps ${outcome.creeps}  ` +
        `cpu p95 ${outcome.p95Ms.toFixed(2)}ms max ${outcome.maxMs.toFixed(2)}ms  ` +
        `paths/tick ${outcome.searches.toFixed(2)}`,
    );
  }
}

console.log(
  failures === 0
    ? '\nall matches won'
    : `\n${failures} of ${styles.length * sides.length} matches not won`,
);
process.exit(failures === 0 ? 0 : 1);
