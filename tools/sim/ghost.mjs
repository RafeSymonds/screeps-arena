// An opponent whose economy is taken from a real match instead of guessed at.
//
// A replay knows two things about an opponent that cannot be reconstructed by
// reasoning: exactly what it built, and exactly when each creep hit the field.
// That is most of a strategy in this arena, where the energy budget is fixed and
// there is nothing to spend it on but bodies.
//
// It does *not* usefully know how the opponent moved. Those positions were a
// response to whatever bot it was playing at the time; replaying them against a
// different bot walks the creeps into guns they would have avoided. (Tried it:
// the recorded s12141209 lost 8-0 to a bot it had beaten in reality.) So
// movement comes from a behaviour policy, inferred from what the bodies are for.
import { collectGames, sideFromLog } from '../replay/cache.mjs';
import { P, C, state, injectCreep, direction } from './engine.mjs';
import { getRange } from './stubs/utils.mjs';
import { searchPath, CostMatrix } from './stubs/path-finder.mjs';

const parts = (creep, type) => creep.body.filter(p => p.type === type && p.hits > 0).length;

/** How far a besieging creep will back off from the spawn it is threatening. */
const SIEGE_RANGE = 22;

/** When each of their creeps became active, and what it was made of. */
export function scheduleOf(game) {
  const mine = sideFromLog(game);
  const recorded = mine === 'player1' ? 'player2' : 'player1';
  const seen = new Map();
  for (const frame of game.frames) {
    for (const o of frame.objects) {
      if (o.prototypeName !== 'Creep' || o.user !== recorded || o.spawning) continue;
      if (seen.has(o._id)) continue;
      seen.set(o._id, { tick: frame.gameTime, body: o.body.map(p => p.type) });
    }
  }
  return [...seen.values()].sort((a, b) => a.tick - b.tick);
}

export function describe(gameId) {
  const game = find(gameId);
  if (!game) return null;
  const you = game.record?.users?.find(u => u._id === game.record.user)?.username;
  const schedule = scheduleOf(game);
  return {
    id: game.id,
    opponent: game.record?.users?.map(u => u.username).find(n => n !== you) ?? '?',
    side: sideFromLog(game),
    creeps: schedule.length,
    policy: policyFor(schedule),
  };
}

const find = id => collectGames().find(g => g.id === id || g.id.startsWith(id));

/**
 * What the bodies are for. A creep with ranged parts and no melee has no reason
 * ever to be touched, so it kites; anything built to hit at range 1 has to come
 * to us.
 */
export function policyFor(schedule) {
  let ranged = 0;
  let melee = 0;
  for (const entry of schedule) {
    for (const part of entry.body) {
      if (part === C.RANGED_ATTACK) ranged += 1;
      if (part === C.ATTACK) melee += 1;
    }
  }
  return ranged > melee ? 'kite' : 'push';
}

export function create(gameId, side) {
  const game = find(gameId);
  if (!game) throw new Error(`no cached game ${gameId}`);
  if (game.frames.length === 0) throw new Error(`game ${gameId} has no replay frames cached`);

  const schedule = scheduleOf(game);
  const policy = policyFor(schedule);
  let next = 0;

  const mine = () => state.objects.filter(o => o instanceof P.Creep && o.owner === side);
  const theirs = () =>
    state.objects.filter(o => o instanceof P.Creep && !o.spawning && o.owner && o.owner !== side);

  function matrix() {
    const m = new CostMatrix();
    for (const o of state.objects) {
      if (
        o instanceof P.StructureWall ||
        o instanceof P.StructureExtension ||
        o instanceof P.StructureSpawn
      ) {
        m.set(o.x, o.y, 255);
      }
      if (o instanceof P.StructureRampart && o.owner && o.owner !== side) m.set(o.x, o.y, 255);
    }
    for (const c of state.objects) {
      if (c instanceof P.Creep && !c.spawning) m.set(c.x, c.y, c.owner === side ? 4 : 40);
    }
    return m;
  }

  function step(creep, goal, range, m) {
    const load = creep.body.filter(p => p.type !== C.MOVE && p.hits > 0).length;
    const move = parts(creep, C.MOVE);
    const next2 = searchPath(creep, { pos: goal, range }, {
      costMatrix: m,
      maxOps: 20000,
      swampCost: load === 0 || move >= load * 5 ? 2 : 10,
    }).path[0];
    if (next2) creep.move(direction(next2.x - creep.x, next2.y - creep.y));
  }

  return function run() {
    // Field their creeps on exactly the ticks the recording says they appeared.
    const spawnPoint = state.objects.find(o => o instanceof P.StructureSpawn && o.owner === side);
    while (next < schedule.length && schedule[next].tick <= state.tick) {
      const entry = schedule[next];
      next += 1;
      if (!spawnPoint) continue;
      const spot = free(spawnPoint, side);
      if (spot) injectCreep({ owner: side, body: entry.body, x: spot.x, y: spot.y });
    }

    const enemies = theirs();
    const target = state.objects.find(o => o instanceof P.StructureSpawn && o.owner !== side);
    const m = matrix();

    // Focus fire. Spreading damage over a crowd kills nothing and removes none
    // of its output; concentrating it takes creeps off the board. Every serious
    // opponent does this, and a ghost that does not hands our bot an edge it
    // will not have in a real match. Healers first, then whatever is closest to
    // dying — the same ordering our own bot uses.
    const score = c =>
      parts(c, C.HEAL) * 40 + parts(c, C.RANGED_ATTACK) * 12 + parts(c, C.ATTACK) * 8 +
      (c.hitsMax - c.hits) / 100;
    const focus = [...enemies].sort((a, b) => score(b) - score(a));

    for (const creep of mine()) {
      if (creep.spawning) continue;
      const melee = focus.find(e => getRange(creep, e) <= 1);
      if (melee) creep.attack(melee);
      else if (target && getRange(creep, target) <= 1) creep.attack(target);

      const shot = focus.find(e => getRange(creep, e) <= 3);
      if (shot) creep.rangedAttack(shot);
      else if (target && getRange(creep, target) <= 3) creep.rangedAttack(target);

      if (parts(creep, C.HEAL) > 0) {
        const hurt = mine()
          .filter(c => c.hits < c.hitsMax && getRange(creep, c) <= 3)
          .sort((a, b) => b.hitsMax - b.hits - (a.hitsMax - a.hits))[0];
        if (hurt) {
          if (getRange(creep, hurt) <= 1) creep.heal(hurt);
          else creep.rangedHeal(hurt);
        }
      }

      if (policy === 'kite') {
        // Back off from *anything*, not just from melee. A ranged creep has no
        // reason to stand inside a massed formation: the real ones hovered at
        // five tiles for hundreds of ticks, shot whatever strayed, and only
        // closed on the spawn once the army had wandered off. Fleeing only from
        // melee walked them into a wall of ranged support instead.
        const closing = enemies.filter(e => getRange(creep, e) <= 4);
        if (closing.length > 0) {
          const away = searchPath(creep, closing.map(e => ({ pos: e, range: 6 })), {
            costMatrix: m,
            flee: true,
            maxOps: 8000,
          }).path[0];
          // Give ground, but do not leave. The real ones hovered a few tiles off
          // the spawn they were besieging for hundreds of ticks; a ghost that
          // retreats across the map stops looking like a threat, and the bot
          // under test reads the board as safe and marches out to win.
          const stillClose = away && (!target || getRange(away, target) <= SIEGE_RANGE);
          if (stillClose) {
            creep.move(direction(away.x - creep.x, away.y - creep.y));
            continue;
          }
          if (away && getRange(creep, target) > SIEGE_RANGE) {
            // Already at the edge of the leash: hold and keep shooting.
            continue;
          }
        }
      }
      if (target) step(creep, target, 1, m);
    }
  };
}

const DIRS = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

function free(structure, side) {
  for (const [dx, dy] of DIRS) {
    const x = structure.x + dx;
    const y = structure.y + dy;
    if (x < 0 || x > 99 || y < 0 || y > 99) continue;
    if (state.terrain[y * 100 + x] === 1) continue;
    const blocked = state.objects.some(
      o =>
        o.x === x &&
        o.y === y &&
        (o instanceof P.Creep ||
          o instanceof P.StructureWall ||
          o instanceof P.StructureSpawn ||
          o instanceof P.StructureExtension ||
          (o instanceof P.StructureRampart && o.owner && o.owner !== side)),
    );
    if (!blocked) return { x, y };
  }
  return null;
}
