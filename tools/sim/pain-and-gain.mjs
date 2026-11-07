// Offline Pain and Gain: plays the built season4-pain_and_gain bundle against
// our own earlier builds on a real match's starting position.
//
//   node tools/sim/pain-and-gain.mjs                      every saved build, both sides
//   node tools/sim/pain-and-gain.mjs --opponent focus-fire --side 2 --trace
//   node tools/sim/pain-and-gain.mjs --opponent bundle:some/other/main.mjs
//   node tools/sim/pain-and-gain.mjs --game <archived id> that match's terrain and opening
//
// Opponents are the builds saved in versions/season4-pain_and_gain/ by
// `bin/arena snapshot`, plus `passive`, which does nothing and is only there
// to catch a bot that crashes. Scripted opponents written to imitate real
// players were tried and dropped: the bot beat every one of them while
// losing to the players they imitated. Real opponents are tested with
// `bin/arena test`; this is for regressions against ourselves and crashes.
//
// Both sides share the engine model's misreadings of the rules, so a result
// here says one build beats another under our understanding of the game, not
// that either wins for real. See README.md. Arena rules modelled here, from the
// arena description:
//   - standing on a ScoreFlag captures it; it scores scorePerTick for its owner
//     every tick and debuffs the owner's whole army (STACKING below);
//   - highest score at tick 2000 wins; wiping out the other army wins outright;
//   - the match ends early once the trailing side cannot catch up even holding
//     every flag (MAX_SCORE_PER_TICK) for the rest of the match.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import zlib from 'node:zlib';

import {
  beginTick,
  buildWorldFromFrame,
  endTick,
  injectCreep,
  P,
  setSide,
  state,
} from './engine.mjs';
import { ARCHIVE_DIR, readArchive } from '../replay/archive.mjs';
import * as C from './stubs/constants.mjs';

register('./hooks.mjs', import.meta.url);
const { ScoreFlag, MAX_SCORE_PER_TICK } = await import('./stubs/pain-and-gain.mjs');

const ARENA = 'season4-pain_and_gain';
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const has = name => argv.includes(`--${name}`);
const TICKS = Number(flag('ticks', 2000));
const TRACE = has('trace');
const EVERY = Number(flag('every', 100));

const VERSIONS = new URL(`../../versions/${ARENA}/`, import.meta.url);
const PERSONAS = new URL('./personas/', import.meta.url);
// The bot under test: the current build, or a saved one by name (--bot).
const botName = flag('bot');
const bundle = !botName
  ? path.resolve(`dist/${ARENA}/main.mjs`)
  : botName.startsWith('persona:')
    ? fileURLToPath(new URL(`${botName.slice('persona:'.length)}.mjs`, PERSONAS))
    : fileURLToPath(new URL(`${botName}.mjs`, VERSIONS));
if (!existsSync(bundle)) {
  console.error(`No bundle at ${bundle}. Run 'bin/arena build ${ARENA}' first.`);
  process.exit(1);
}

// --- the arena --------------------------------------------------------------

/** docs/api/Modifier_effects.md: multiplier for 0, 1, 2 flags of a type. */
const STACKING = {
  [C.EFF_ATTACK_MODIFIER]: [1, 0.8, 0.6],
  [C.EFF_RANGED_ATTACK_MODIFIER]: [1, 0.8, 0.6],
  [C.EFF_HEAL_MODIFIER]: [1, 0.75, 0.5],
  [C.EFF_DAMAGE_TAKEN_MODIFIER]: [1, 1.1],
};
const EFFECT_OF = {
  attack: C.EFF_ATTACK_MODIFIER,
  ranged: C.EFF_RANGED_ATTACK_MODIFIER,
  heal: C.EFF_HEAL_MODIFIER,
  taken: C.EFF_DAMAGE_TAKEN_MODIFIER,
};

const flags = () => state.objects.filter(o => o instanceof ScoreFlag);

function multiplier(owner, effect) {
  const n = flags().filter(f => f.owner === owner && f.effectType === effect).length;
  const table = STACKING[effect];
  return table[Math.min(n, table.length - 1)];
}

state.modify = (kind, creep, amount) =>
  Math.round(amount * multiplier(creep.owner, EFFECT_OF[kind]));

/**
 * The newest N archived Pain and Gain games, one terrain sample each. Reads
 * files one at a time: the whole archive does not fit in memory at once.
 */
function archivedMaps(n) {
  const files = readdirSync(ARCHIVE_DIR)
    .filter(f => f.endsWith('.json.gz'))
    .map(f => ({ f, t: statSync(path.join(ARCHIVE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const games = [];
  for (const { f } of files) {
    if (games.length >= n) break;
    const g = JSON.parse(zlib.gunzipSync(readFileSync(path.join(ARCHIVE_DIR, f))).toString('utf8'));
    const f0 = g.frames?.find(x => x.gameTime === 0);
    if (g.record?.game?.terrain && f0?.objects?.some(o => o.prototypeName === 'ScoreFlag')) {
      games.push(fixtureOf(g));
    }
  }
  return games;
}

function fixtureOf(game) {
  const f = game.frames.find(x => x.gameTime === 0) ?? game.frames[0];
  return {
    id: game.id,
    terrain: game.record.game.terrain,
    creeps: f.objects
      .filter(o => o.prototypeName === 'Creep')
      .map(o => ({ user: o.user, x: o.x, y: o.y, body: o.body.map(p => p.type) })),
    flags: f.objects
      .filter(o => o.prototypeName === 'ScoreFlag')
      .map(o => ({
        id: o._id,
        x: o.x,
        y: o.y,
        effectType: o.effectType,
        scorePerTick: o.scorePerTick,
      })),
  };
}

function loadFixture(gameId = flag('game')) {
  const id = gameId;
  if (!id) {
    return JSON.parse(
      readFileSync(new URL('./fixtures/pain-and-gain.json', import.meta.url), 'utf8'),
    );
  }
  const game = readArchive().find(g => g.id === id || g.id.startsWith(id));
  if (!game) throw new Error(`no archived game ${id} in matches/ (bin/arena fetch)`);
  const f = game.frames.find(x => x.gameTime === 0) ?? game.frames[0];
  return {
    terrain: game.record.game.terrain,
    creeps: f.objects
      .filter(o => o.prototypeName === 'Creep')
      .map(o => ({ user: o.user, x: o.x, y: o.y, body: o.body.map(p => p.type) })),
    flags: f.objects
      .filter(o => o.prototypeName === 'ScoreFlag')
      .map(o => ({
        id: o._id,
        x: o.x,
        y: o.y,
        effectType: o.effectType,
        scorePerTick: o.scorePerTick,
      })),
  };
}

function setUp(fixture, me) {
  buildWorldFromFrame(fixture.terrain, { objects: [] }, me);
  for (const c of fixture.creeps) {
    const creep = injectCreep({ owner: c.user, body: c.body, x: c.x, y: c.y });
    // injectCreep marks creeps as recording-driven; these move by intents.
    creep.ghost = false;
    creep.effects = [];
  }
  for (const f of fixture.flags) {
    const object = new ScoreFlag();
    Object.assign(object, { ...f, owner: null, exists: true });
    state.objects.push(object);
  }
}

// --- opponents ----------------------------------------------------------------

const creepsOf = side =>
  state.objects.filter(o => o instanceof P.Creep && o.exists && o.owner === side);

/** Saved builds by name, from `bin/arena snapshot`. */
function savedBuilds() {
  if (!existsSync(VERSIONS)) return {};
  return Object.fromEntries(
    readdirSync(VERSIONS)
      .filter(f => f.endsWith('.mjs'))
      .map(f => [f.slice(0, -4), fileURLToPath(new URL(f, VERSIONS))]),
  );
}

// --- matches ----------------------------------------------------------------

let loads = 0;
const loadBot = file => import(`${pathToFileURL(path.resolve(file)).href}?run=${loads++}`);

/** The bundle file an opponent name plays, or null for `passive`. */
function opponentFile(name) {
  if (name === 'passive') return null;
  if (name === 'mirror') return bundle;
  if (name.startsWith('bundle:')) return name.slice('bundle:'.length);
  // A persona: a scripted copy of a real player, built from its replays.
  if (name.startsWith('persona:')) {
    return fileURLToPath(new URL(`${name.slice('persona:'.length)}.mjs`, PERSONAS));
  }
  const file = savedBuilds()[name];
  if (!file) {
    const known = ['passive', 'mirror', ...Object.keys(savedBuilds())].join(' | ');
    console.error(`unknown opponent ${name}: ${known} | bundle:<file>`);
    process.exit(2);
  }
  return file;
}

async function play(name, side, fixture, trace) {
  const me = side === 2 ? 'player2' : 'player1';
  const foe = side === 2 ? 'player1' : 'player2';
  setUp(fixture, me);
  const bot = await loadBot(bundle);
  const file = opponentFile(name);
  const twin = file ? await loadBot(file) : null;

  const score = { [me]: 0, [foe]: 0 };
  const quiet = console.log;
  let crash;
  let result;

  for (let i = 0; i < TICKS; i += 1) {
    beginTick();
    if (!trace) console.log = () => {};
    try {
      setSide(me);
      bot.loop();
    } catch (error) {
      crash = { tick: state.tick, error, who: 'bot' };
    }
    if (!crash) {
      // The opponent always runs with console muted; its log is not ours.
      console.log = () => {};
      try {
        setSide(foe);
        twin?.loop();
      } catch (error) {
        crash = { tick: state.tick, error, who: name };
      }
    }
    console.log = quiet;
    setSide(me);
    if (crash) break;
    endTick();

    for (const f of flags()) if (f.owner) score[f.owner] += f.scorePerTick;
    if (trace) for (const e of state.events.splice(0)) console.log(`  ${e}`);
    else state.events.length = 0;
    if (trace && state.tick % EVERY === 0) {
      const show = s =>
        creepsOf(s)
          .map(
            c =>
              `${String(c.body.find(p => p.type !== C.MOVE)?.type ?? 'move').slice(0, 1)}(${c.x},${c.y})${Math.round((100 * c.hits) / c.hitsMax)}%`,
          )
          .join(' ');
      console.log(`  t${state.tick} sim score ${score[me]}-${score[foe]}`);
      console.log(`    me: ${show(me)}`);
      console.log(`    op: ${show(foe)}`);
    }

    const mineLeft = creepsOf(me).length;
    const foeLeft = creepsOf(foe).length;
    if (foeLeft === 0 || mineLeft === 0) {
      result =
        foeLeft === 0 && mineLeft > 0 ? 'win' : mineLeft === 0 && foeLeft > 0 ? 'loss' : 'draw';
      break;
    }
    const catchUp = MAX_SCORE_PER_TICK * (TICKS - state.tick);
    if (score[me] - score[foe] > catchUp) {
      result = 'win';
      break;
    }
    if (score[foe] - score[me] > catchUp) {
      result = 'loss';
      break;
    }
  }
  if (!result) result = score[me] > score[foe] ? 'win' : score[me] < score[foe] ? 'loss' : 'draw';

  return {
    result,
    crash,
    side: me,
    tick: state.tick,
    score: `${score[me]}-${score[foe]}`,
    creeps: `${creepsOf(me).length}v${creepsOf(foe).length}`,
    flags: `${flags().filter(f => f.owner === me).length}/${flags().filter(f => f.owner === foe).length}`,
  };
}

// --maps N plays every match on N archived maps, since terrain is random per
// match and one map can favour one side.
const fixtures = has('maps') ? archivedMaps(Number(flag('maps'))) : [loadFixture()];
const mapIds = fixtures.map(f => f.id).filter(Boolean);
const names = has('opponent') ? [flag('opponent')] : ['passive', ...Object.keys(savedBuilds())];
const sides = has('side') ? [Number(flag('side'))] : [1, 2];
const single = names.length === 1 && sides.length === 1;
for (const n of names) opponentFile(n);

console.log(
  `arena ${ARENA} · bot ${flag('bot') ?? 'current build'} · ${mapIds[0] ? `${mapIds.length} map(s)` : 'fixture pain-and-gain'} · ${TICKS} ticks\n`,
);
// A crash, or failing to beat a bot that does nothing, is a broken build.
// Results against our own builds are information: a new build is meant to
// beat old ones, but losing one side of a symmetric map can be the map.
let broken = 0;
const tally = { win: 0, loss: 0, draw: 0 };
for (const name of names) {
  for (const fixture of fixtures)
    for (const side of sides) {
      const o = await play(name, side, fixture, TRACE && single);
      if (o.crash) {
        broken += 1;
        console.log(`${name} as player${side}: ${o.crash.who} CRASHED on tick ${o.crash.tick}`);
        console.log(o.crash.error);
        continue;
      }
      if (name === 'passive' && o.result !== 'win') broken += 1;
      else if (name !== 'passive') tally[o.result] += 1;
      const verdict = { win: 'win ', loss: 'LOSS', draw: 'DRAW' }[o.result];
      console.log(
        `${name.padEnd(14)} ${o.side.padEnd(7)}  ${verdict}  t${String(o.tick).padStart(4)}  ` +
          `score ${o.score.padEnd(13)} creeps ${o.creeps.padEnd(5)}  flags ${o.flags}`,
      );
    }
}
console.log(
  `\nagainst opponents: ${tally.win} won, ${tally.loss} lost, ${tally.draw} drawn` +
    (broken ? `\n${broken} broken (crash, or failed to beat passive)` : ''),
);
process.exit(broken === 0 ? 0 : 1);
