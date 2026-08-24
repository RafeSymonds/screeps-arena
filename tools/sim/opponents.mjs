// Scripted opponents for the simulator. They are deliberately simple and
// deliberately varied: the point is to catch a bot that only beats one shape of
// enemy, not to be good players. They talk to the engine directly rather than
// through the `game/*` stubs, so they never see `my` from the bot's side.
import { P, C, state, direction } from './engine.mjs';
import { CostMatrix, searchPath } from './stubs/path-finder.mjs';
import { getRange } from './stubs/utils.mjs';

/**
 * Interleave MOVE with the working parts, exactly as a competent bot would.
 * Blocking them (all MOVE, then all ATTACK) strands the creep the moment its
 * MOVE parts are chewed off, and an opponent crippled that way proves nothing.
 */
function lay(tough, move, work) {
  const body = Array(tough).fill(C.TOUGH);
  let placed = 0;
  let taken = 0;
  while (placed < move || taken < work.length) {
    const moveIsBehind = placed * work.length <= taken * move;
    if (placed < move && (taken >= work.length || moveIsBehind)) {
      body.push(C.MOVE);
      placed += 1;
    } else {
      body.push(work[taken]);
      taken += 1;
    }
  }
  return body;
}

const repeat = (n, part) => Array(n).fill(part);

export const STYLES = {
  /**
   * DefaultO, reconstructed from game 6a8c8dac19e76e3a8caff97a: one maximum-size
   * 25 MOVE / 25 RANGED_ATTACK blob started on tick 13, then a 12 MOVE / 9 HEAL
   * medic behind it. Full speed on plains and 250 damage at range 3 with 108
   * hits a tick of healing — it beat this bot 3000 to 1440.
   */
  deathball: {
    queue: [
      () => [C.MOVE],
      () => lay(0, 2, repeat(1, C.RANGED_ATTACK)),
      () => lay(0, 25, repeat(25, C.RANGED_ATTACK)),
      () => lay(0, 12, repeat(9, C.HEAL)),
    ],
    body: () => lay(0, 2, repeat(1, C.RANGED_ATTACK)),
    massAt: 1,
    kites: true,
  },
  /**
   * s12141209, from game 6a8c8db119e76e54dcaff97b: a 20-part 11 MOVE /
   * 7 RANGED_ATTACK / 2 HEAL creep every sixty ticks, forever, from tick one.
   * Never massed, never stopped, and won without this bot landing a blow.
   */
  kiter: { body: () => lay(0, 11, [...repeat(7, C.RANGED_ATTACK), ...repeat(2, C.HEAL)]), massAt: 1, kites: true },

  /** Ranged/heal blob — the usual Screeps answer, masses before it commits. */
  ranged: {
    body: () => lay(3, 13, [...repeat(8, C.RANGED_ATTACK), ...repeat(2, C.HEAL)]),
    massAt: 2,
  },
  /** Cheap melee straight at the spawn, as fast and as often as possible. */
  rusher: { body: () => lay(0, 10, repeat(10, C.ATTACK)), massAt: 1 },
  /** Melee blob that gathers first — roughly the plan our own bot runs. */
  blob: { body: () => lay(4, 16, repeat(12, C.ATTACK)), massAt: 3 },
  /** Many small fast creeps instead of a few big ones. */
  swarm: { body: () => lay(1, 6, repeat(5, C.ATTACK)), massAt: 1 },
  /** Never leaves home: a ranged/heal wall parked on its own spawn. */
  turtle: {
    body: () => lay(4, 12, [...repeat(8, C.RANGED_ATTACK), ...repeat(4, C.HEAL)]),
    massAt: 1,
    defends: true,
  },
};

export function create(side, styleName) {
  const style = STYLES[styleName];
  if (!style) throw new Error(`unknown opponent style: ${styleName}`);
  let built = 0;

  const mine = cls => state.objects.filter(o => o instanceof cls && o.owner === side);
  const theirs = cls => state.objects.filter(o => o instanceof cls && o.owner && o.owner !== side);

  function matrix() {
    const m = new CostMatrix();
    for (const rampart of state.objects.filter(o => o instanceof P.StructureRampart)) {
      if (rampart.owner === side) m.set(rampart.x, rampart.y, 1);
      else if (rampart.owner) m.set(rampart.x, rampart.y, 255);
    }
    for (const object of state.objects) {
      if (
        object instanceof P.StructureWall ||
        object instanceof P.StructureExtension ||
        object instanceof P.StructureSpawn
      ) {
        m.set(object.x, object.y, 255);
      }
    }
    for (const creep of state.objects.filter(o => o instanceof P.Creep && !o.spawning)) {
      m.set(creep.x, creep.y, creep.owner === side ? 4 : 40);
    }
    return m;
  }

  function step(creep, goal, range, m) {
    // A creep carrying no working parts generates no fatigue, so swamp costs it
    // nothing. Opponents that miss this lose the flag race for the wrong reason.
    const load = creep.body.filter(p => p.type !== C.MOVE && p.hits > 0).length;
    const next = searchPath(
      creep,
      { pos: goal, range },
      {
        costMatrix: m,
        maxOps: 30000,
        swampCost: load === 0 ? 2 : 10,
      },
    ).path[0];
    if (next) creep.move(direction(next.x - creep.x, next.y - creep.y));
  }

  return function run() {
    const spawn = mine(P.StructureSpawn)[0];
    if (!spawn) return;
    const target = theirs(P.StructureSpawn)[0];

    if (!spawn.spawning) {
      // A `queue` replays a real opponent's build order, then repeats its last
      // entry; otherwise: two flag runners, then fighters until the energy runs out.
      const body = style.queue
        ? style.queue[Math.min(built, style.queue.length - 1)]()
        : built < 2
          ? [C.MOVE]
          : style.body();
      if (!spawn.spawnCreep(body).error) built += 1;
    }

    const m = matrix();
    const flags = state.objects.filter(o => o instanceof P.Flag);
    const all = mine(P.Creep).filter(c => !c.spawning);
    const runners = all.filter(c => c.body.length <= 2);
    const army = all.filter(c => c.body.length > 2);
    const enemies = theirs(P.Creep).filter(c => !c.spawning);

    runners.forEach((creep, i) => {
      const flag = flags[i % flags.length];
      if (flag && getRange(creep, flag) > 0) step(creep, flag, 0, m);
    });

    for (const creep of army) {
      const melee = enemies.find(e => getRange(creep, e) <= 1);
      if (melee) creep.attack(melee);
      else if (target && getRange(creep, target) <= 1) creep.attack(target);

      const shot = enemies.find(e => getRange(creep, e) <= 3);
      if (shot) creep.rangedAttack(shot);
      else if (target && getRange(creep, target) <= 3) creep.rangedAttack(target);

      const hurt = all.filter(c => c.hits < c.hitsMax && getRange(creep, c) <= 3);
      if (hurt.length > 0) {
        if (getRange(creep, hurt[0]) <= 1) creep.heal(hurt[0]);
        else creep.rangedHeal(hurt[0]);
      }

      if (style.defends) {
        const near = enemies.filter(e => getRange(spawn, e) <= 10);
        if (near.length > 0) {
          if (getRange(creep, near[0]) > 1) step(creep, near[0], 1, m);
        } else if (getRange(creep, spawn) > 3) {
          step(creep, spawn, 2, m);
        }
        continue;
      }

      if (style.kites) {
        // The whole point of a ranged body: never let melee reach you. Back off
        // from anything that has to touch you to hurt you, and keep shooting.
        const melee = enemies.filter(
          e => e.body.some(p => p.type === C.ATTACK && p.hits > 0) && getRange(creep, e) <= 3,
        );
        if (melee.length > 0) {
          const away = searchPath(creep, melee.map(e => ({ pos: e, range: 5 })), {
            costMatrix: m,
            flee: true,
            maxOps: 8000,
          }).path[0];
          if (away) creep.move(direction(away.x - creep.x, away.y - creep.y));
          continue;
        }
      }
      if (army.length >= style.massAt && target) step(creep, target, 1, m);
    }
  };
}
