// Offline Pain and Gain: plays the built season4-pain_and_gain bundle against
// scripted opponents, or against itself, on a real match's starting position.
//
//   node tools/sim/pain-and-gain.mjs                       every opponent, both sides
//   node tools/sim/pain-and-gain.mjs --opponent mirror --side 2 --trace
//   node tools/sim/pain-and-gain.mjs --opponent bundle:old.mjs  vs another build
//   node tools/sim/pain-and-gain.mjs --game <archived id>  that match's terrain and opening
//
// The same caveat as run.mjs applies: the engine is a model written from the
// docs, so this finds crashes and incoherent play, not misread rules. See
// README.md. Arena rules modelled here, from the arena description:
//   - standing on a ScoreFlag captures it; it scores scorePerTick for its owner
//     every tick and debuffs the owner's whole army (STACKING below);
//   - highest score at tick 2000 wins; wiping out the other army wins outright;
//   - the match ends early once the trailing side cannot catch up even holding
//     every flag (MAX_SCORE_PER_TICK) for the rest of the match.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import {
  beginTick,
  buildWorldFromFrame,
  endTick,
  injectCreep,
  P,
  setSide,
  state,
} from './engine.mjs';
import { readArchive } from '../replay/archive.mjs';
import { searchPath } from './stubs/path-finder.mjs';
import { getRange, getDirection } from './stubs/utils.mjs';
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

const bundle = path.resolve(`dist/${ARENA}/main.mjs`);
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

function loadFixture() {
  const id = flag('game');
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

const parts = (c, type) => c.body.filter(p => p.type === type && p.hits > 0).length;
const creepsOf = side =>
  state.objects.filter(o => o instanceof P.Creep && o.exists && o.owner === side);
const nearest = (from, list) =>
  list.reduce((best, o) => (!best || getRange(from, o) < getRange(from, best) ? o : best), null);

function stepTo(c, goal, range) {
  if (getRange(c, goal) <= range) return;
  const step = searchPath(c, { pos: goal, range }, {}).path[0];
  if (step) c.move(getDirection(step.x - c.x, step.y - c.y));
}

/** Swing at whatever is in reach and patch up whoever is hurt. Shared by every script. */
function fightInPlace(c, foes, friends) {
  const close = nearest(c, foes);
  if (close && parts(c, C.ATTACK) > 0 && getRange(c, close) <= 1) c.attack(close);
  if (close && parts(c, C.RANGED_ATTACK) > 0 && getRange(c, close) <= 3) c.rangedAttack(close);
  if (parts(c, C.HEAL) > 0) {
    const hurt = friends
      .filter(f => f.hits < f.hitsMax && getRange(c, f) <= 3)
      .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0];
    if (hurt && getRange(c, hurt) <= 1) c.heal(hurt);
    else if (hurt) c.rangedHeal(hurt);
  }
}

const armed = c => parts(c, C.ATTACK) + parts(c, C.RANGED_ATTACK) > 0;

/**
 * Scripted styles. Each is a function of the side it plays and returns a
 * per-tick callback. `mirror` is the bot itself, loaded a second time.
 */
const SCRIPTS = {
  /** The arena's System bot: in the one real game against it, it did nothing at all. */
  passive: () => () => {},

  /** Everything runs for the nearest flag it does not own, fighting on the way. */
  greedy: side => () => {
    const mine = creepsOf(side);
    const foes = state.objects.filter(o => o instanceof P.Creep && o.owner !== side);
    const claimed = new Set();
    for (const c of mine) {
      fightInPlace(c, foes, mine);
      const goal = nearest(
        c,
        flags().filter(f => f.owner !== side && !claimed.has(f)),
      );
      if (goal) {
        claimed.add(goal);
        stepTo(c, goal, 0);
      } else {
        const foe = nearest(c, foes);
        if (foe) stepTo(c, foe, 1);
      }
    }
  },

  /**
   * Scouts take the two nearest flags; the army ignores flags and hunts as one
   * blob, so it never carries more than those two debuffs.
   */
  brawler: side => {
    return () => {
      const mine = creepsOf(side);
      const foes = state.objects.filter(o => o instanceof P.Creep && o.owner !== side);
      const army = mine.filter(armed);
      const lead = army[0];
      const prey = lead ? nearest(lead, foes) : null;
      for (const c of mine) {
        fightInPlace(c, foes, mine);
        if (!armed(c) && parts(c, C.HEAL) === 0) {
          const goal = nearest(
            c,
            flags().filter(f => f.owner !== side),
          );
          if (goal && flags().filter(f => f.owner === side).length < 2) stepTo(c, goal, 0);
          continue;
        }
        if (lead && c !== lead && getRange(c, lead) > 3) stepTo(c, lead, 1);
        else if (prey) stepTo(c, prey, parts(c, C.ATTACK) > 0 ? 1 : 3);
      }
    };
  },

  /**
   * One tight blob that walks at the nearest enemy and focuses it: every melee
   * on the same creep, ranged at two to three tiles, healers on whoever is
   * lowest. Modelled on MetalicaX, who beat every version of the bot in real
   * games by arriving all at once and killing our front creep in a few ticks.
   */
  focus: side => () => {
    const mine = creepsOf(side);
    const foes = state.objects.filter(o => o instanceof P.Creep && o.owner !== side);
    const army = mine.filter(c => armed(c) || parts(c, C.HEAL) > 0);
    if (army.length === 0 || foes.length === 0) return;
    const mid = {
      x: Math.round(army.reduce((a, c) => a + c.x, 0) / army.length),
      y: Math.round(army.reduce((a, c) => a + c.y, 0) / army.length),
    };
    const prey = nearest(mid, foes.filter(armed).length ? foes.filter(armed) : foes);
    const lead = Math.min(...army.map(c => getRange(c, prey)));
    for (const c of mine) {
      const inReach = foes.filter(f => getRange(c, f) <= 1);
      if (parts(c, C.ATTACK) > 0 && inReach.length)
        c.attack(inReach.includes(prey) ? prey : inReach[0]);
      if (parts(c, C.RANGED_ATTACK) > 0) {
        const shot = getRange(c, prey) <= 3 ? prey : nearest(c, foes);
        if (shot && getRange(c, shot) <= 3) c.rangedAttack(shot);
      }
      if (parts(c, C.HEAL) > 0) {
        const hurt = mine
          .filter(f => f.hits < f.hitsMax && getRange(c, f) <= 3)
          .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0];
        if (hurt && getRange(c, hurt) <= 1) c.heal(hurt);
        else if (hurt) c.rangedHeal(hurt);
      }
      // Nobody steps more than two tiles ahead of the closest member, so the
      // blob arrives together.
      const d = getRange(c, prey);
      if (d > lead + 2 && getRange(c, mid) <= 3) {
        stepTo(c, prey, d - 1);
        continue;
      }
      if (parts(c, C.ATTACK) > 0) stepTo(c, prey, 1);
      else if (parts(c, C.RANGED_ATTACK) > 0) stepTo(c, prey, 2);
      else if (parts(c, C.HEAL) > 0) {
        const hurt = mine
          .filter(f => f !== c && f.hits < f.hitsMax)
          .sort((a, b) => getRange(c, a) - getRange(c, b))[0];
        stepTo(c, hurt ?? mid, 1);
      } else stepTo(c, mid, 2);
    }
  },

  /** Takes the vulnerability flag and everything ranged-only, then holds the centre. */
  turtle: side => () => {
    const mine = creepsOf(side);
    const foes = state.objects.filter(o => o instanceof P.Creep && o.owner !== side);
    const wanted = flags().filter(
      f =>
        f.effectType === C.EFF_DAMAGE_TAKEN_MODIFIER ||
        f.effectType === C.EFF_RANGED_ATTACK_MODIFIER,
    );
    const centre = { x: 49, y: 49 };
    const scouts = mine.filter(c => !armed(c) && parts(c, C.HEAL) === 0);
    const todo = wanted.filter(f => f.owner !== side);
    for (const c of mine) {
      fightInPlace(c, foes, mine);
      if (scouts.includes(c)) {
        const goal = todo[scouts.indexOf(c) % Math.max(1, todo.length)];
        if (goal) stepTo(c, goal, 0);
        continue;
      }
      const threat = nearest(
        c,
        foes.filter(f => getRange(f, centre) <= 8),
      );
      if (threat) stepTo(c, threat, parts(c, C.ATTACK) > 0 ? 1 : 3);
      else stepTo(c, centre, 3);
    }
  },
};

// --- matches ----------------------------------------------------------------

let loads = 0;
const loadBot = (file = bundle) =>
  import(`${pathToFileURL(path.resolve(file)).href}?run=${loads++}`);
/** Opponents that are a whole bot rather than a script: itself, or another build. */
const isBot = style => style === 'mirror' || style.startsWith('bundle:');

async function play(style, side, fixture, trace) {
  const me = side === 2 ? 'player2' : 'player1';
  const foe = side === 2 ? 'player1' : 'player2';
  setUp(fixture, me);
  const bot = await loadBot();
  const twin = isBot(style)
    ? await loadBot(style === 'mirror' ? bundle : style.slice('bundle:'.length))
    : null;
  const script = twin ? null : SCRIPTS[style](foe);

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
        if (twin) {
          setSide(foe);
          twin.loop();
        } else script();
      } catch (error) {
        crash = { tick: state.tick, error, who: style };
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

const fixture = loadFixture();
const styles = has('opponent') ? [flag('opponent')] : [...Object.keys(SCRIPTS), 'mirror'];
const sides = has('side') ? [Number(flag('side'))] : [1, 2];
const single = styles.length === 1 && sides.length === 1;
for (const s of styles) {
  if (!isBot(s) && !SCRIPTS[s]) {
    console.error(`unknown opponent ${s}: ${[...Object.keys(SCRIPTS), 'mirror'].join(' | ')}`);
    process.exit(2);
  }
}

console.log(
  `arena ${ARENA} · ${flag('game') ? `game ${flag('game')}` : 'fixture pain-and-gain'} · ${TICKS} ticks\n`,
);
let failures = 0;
for (const style of styles) {
  for (const side of sides) {
    const o = await play(style, side, fixture, TRACE && single);
    if (o.crash) {
      failures += 1;
      console.log(`${style} as player${side}: ${o.crash.who} CRASHED on tick ${o.crash.tick}`);
      console.log(o.crash.error);
      continue;
    }
    // Self-play is symmetric: a draw or either result is information, not failure.
    if (o.result !== 'win' && !isBot(style)) failures += 1;
    const verdict = { win: 'win ', loss: 'LOSS', draw: 'DRAW' }[o.result];
    console.log(
      `${style.padEnd(8)} ${o.side.padEnd(7)}  ${verdict}  t${String(o.tick).padStart(4)}  ` +
        `score ${o.score.padEnd(13)} creeps ${o.creeps.padEnd(5)}  flags ${o.flags}`,
    );
  }
}
const scripted = styles.filter(s => !isBot(s)).length * sides.length;
console.log(
  failures === 0
    ? '\nno scripted match lost'
    : `\n${failures} of ${scripted} scripted matches not won`,
);
process.exit(failures === 0 ? 0 : 1);
