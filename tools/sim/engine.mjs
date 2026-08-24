// A small model of the Screeps Arena engine: enough of it to run a bot's
// `loop()` against a real arena's starting position and watch what happens.
//
// It is a model, not the engine. See README.md for what it does and does not
// reproduce; a green run here is evidence, never proof.
import { readFileSync } from 'node:fs';
import { state } from './stubs/state.mjs';
import * as P from './stubs/prototypes.mjs';
import * as C from './stubs/constants.mjs';
import { getRange } from './stubs/utils.mjs';
import { searchPath } from './stubs/path-finder.mjs';

const FIXTURES = new URL('./fixtures/', import.meta.url);

let nextId = 1;
/** Which side the bot under test is playing; `my` is reported relative to it. */
let ME = 'player1';

// --- prototype plumbing -----------------------------------------------------

Object.defineProperty(P.GameObject.prototype, 'my', {
  get() {
    if (this.owner === null || this.owner === undefined) return undefined;
    return this.owner === ME;
  },
});

P.GameObject.prototype.getRangeTo = function (pos) {
  return getRange(this, pos);
};
P.GameObject.prototype.findInRange = function (positions, range) {
  return positions.filter(p => getRange(this, p) <= range);
};
P.GameObject.prototype.findClosestByRange = function (positions) {
  let best = null;
  let bestRange = Infinity;
  for (const p of positions) {
    const range = getRange(this, p);
    if (range < bestRange) {
      bestRange = range;
      best = p;
    }
  }
  return best;
};
P.GameObject.prototype.findClosestByPath = function (positions, options) {
  let best = null;
  let bestCost = Infinity;
  for (const p of positions) {
    const result = searchPath(this, { pos: p, range: 1 }, options ?? {});
    if (!result.incomplete && result.cost < bestCost) {
      bestCost = result.cost;
      best = p;
    }
  }
  return best;
};
P.GameObject.prototype.findPathTo = function (pos, options) {
  return searchPath(this, { pos, range: 1 }, options ?? {}).path;
};

function makeStore(energy, capacity) {
  return {
    energy,
    capacity,
    getUsedCapacity() {
      return this.energy;
    },
    getFreeCapacity() {
      return this.capacity - this.energy;
    },
    getCapacity() {
      return this.capacity;
    },
  };
}

const CLASSES = {
  StructureExtension: P.StructureExtension,
  StructureSpawn: P.StructureSpawn,
  StructureRampart: P.StructureRampart,
  StructureWall: P.StructureWall,
  Flag: P.Flag,
};

// --- world construction -----------------------------------------------------

/**
 * Load an arena fixture and set the board to tick zero. `mySide` is the fixture
 * player the bot under test controls, so the same fixture plays from either end.
 */
export function buildWorld(fixture, mySide) {
  ME = mySide;
  nextId = 1;
  state.tick = 0;
  state.objects = [];
  state.events = [];

  const data = JSON.parse(readFileSync(new URL(`${fixture}.json`, FIXTURES), 'utf8'));
  state.terrain = Uint8Array.from(data.terrain, ch => Number(ch));

  for (const spec of data.objects) {
    const object = new CLASSES[spec.type]();
    Object.assign(object, {
      id: nextId++,
      x: spec.x,
      y: spec.y,
      owner: spec.user ?? null,
      exists: true,
      ...(spec.hits === undefined ? {} : { hits: spec.hits, hitsMax: spec.hits }),
      ...(spec.group === undefined ? {} : { group: spec.group }),
      ...(spec.store === undefined ? {} : { store: makeStore(spec.store, spec.capacity) }),
      ...(spec.type === 'StructureSpawn' ? { spawning: null } : {}),
    });
    state.objects.push(object);
  }
  return state;
}

export const sideOf = () => ME;
export const owned = (cls, side) => state.objects.filter(o => o instanceof cls && o.owner === side);

// --- creep and spawn actions ------------------------------------------------

/** Actions are one-per-tick per creep, which is what the conflict rules are. */
const intents = new Map();

function intent(creep) {
  let record = intents.get(creep);
  if (!record) {
    record = {};
    intents.set(creep, record);
  }
  return record;
}

const parts = (creep, type) => creep.body.filter(p => p.type === type && p.hits > 0).length;

function remove(object) {
  const at = state.objects.indexOf(object);
  if (at >= 0) state.objects.splice(at, 1);
  object.exists = false;
}

/** A creep standing on a rampart it owns is shielded by it. */
function damage(target, amount) {
  if (amount <= 0) return;
  if (target instanceof P.Creep) {
    const shield = state.objects.find(
      o =>
        o instanceof P.StructureRampart &&
        o.x === target.x &&
        o.y === target.y &&
        o.owner === target.owner,
    );
    if (shield) return damage(shield, amount);

    // Damage eats body parts front to back, which is what makes part order
    // matter: lose every MOVE part first and the creep is stranded for good.
    let left = amount;
    for (const part of target.body) {
      if (left <= 0) break;
      const bite = Math.min(part.hits, left);
      part.hits -= bite;
      left -= bite;
    }
    target.hits = target.body.reduce((sum, p) => sum + p.hits, 0);
    if (target.hits <= 0) remove(target);
    return;
  }
  target.hits -= amount;
  if (target.hits <= 0) remove(target);
}

function restore(creep, amount) {
  let left = amount;
  for (const part of creep.body) {
    if (left <= 0) break;
    const room = C.BODYPART_HITS - part.hits;
    const give = Math.min(room, left);
    part.hits += give;
    left -= give;
  }
  creep.hits = creep.body.reduce((sum, p) => sum + p.hits, 0);
}

P.Creep.prototype.move = function (direction) {
  if (parts(this, C.MOVE) === 0) return C.ERR_NO_BODYPART;
  intent(this).direction = direction;
  return C.OK;
};

P.Creep.prototype.moveTo = function (pos, options) {
  const step = searchPath(this, { pos, range: 1 }, options ?? {}).path[0];
  if (step) this.move(direction(step.x - this.x, step.y - this.y));
  return C.OK;
};

P.Creep.prototype.attack = function (target) {
  if (parts(this, C.ATTACK) === 0) return C.ERR_NO_BODYPART;
  if (getRange(this, target) > 1) return C.ERR_NOT_IN_RANGE;
  if (intent(this).attacked) return C.ERR_BUSY;
  intent(this).attacked = true;
  damage(target, parts(this, C.ATTACK) * C.ATTACK_POWER);
  return C.OK;
};

P.Creep.prototype.rangedAttack = function (target) {
  if (parts(this, C.RANGED_ATTACK) === 0) return C.ERR_NO_BODYPART;
  if (getRange(this, target) > 3) return C.ERR_NOT_IN_RANGE;
  if (intent(this).shot) return C.ERR_BUSY;
  intent(this).shot = true;
  damage(target, parts(this, C.RANGED_ATTACK) * C.RANGED_ATTACK_POWER);
  return C.OK;
};

P.Creep.prototype.rangedMassAttack = function () {
  if (parts(this, C.RANGED_ATTACK) === 0) return C.ERR_NO_BODYPART;
  if (intent(this).shot) return C.ERR_BUSY;
  intent(this).shot = true;
  const rate = { 0: 1, 1: 1, 2: 0.4, 3: 0.1 };
  for (const object of state.objects.slice()) {
    if (object.owner === null || object.owner === undefined || object.owner === this.owner)
      continue;
    const range = getRange(this, object);
    if (range > 3) continue;
    damage(object, Math.floor(parts(this, C.RANGED_ATTACK) * C.RANGED_ATTACK_POWER * rate[range]));
  }
  return C.OK;
};

// heal conflicts with attack and rangedHeal, but not with rangedAttack.
P.Creep.prototype.heal = function (target) {
  if (parts(this, C.HEAL) === 0) return C.ERR_NO_BODYPART;
  if (getRange(this, target) > 1) return C.ERR_NOT_IN_RANGE;
  if (intent(this).healed || intent(this).attacked) return C.ERR_BUSY;
  intent(this).healed = true;
  restore(target, parts(this, C.HEAL) * C.HEAL_POWER);
  return C.OK;
};

P.Creep.prototype.rangedHeal = function (target) {
  if (parts(this, C.HEAL) === 0) return C.ERR_NO_BODYPART;
  if (getRange(this, target) > 3) return C.ERR_NOT_IN_RANGE;
  if (intent(this).healed || intent(this).attacked || intent(this).shot) return C.ERR_BUSY;
  intent(this).healed = true;
  restore(target, parts(this, C.HEAL) * C.RANGED_HEAL_POWER);
  return C.OK;
};

P.StructureSpawn.prototype.spawnCreep = function (body) {
  if (this.spawning) return { error: C.ERR_BUSY };
  if (!body || body.length === 0 || body.length > C.MAX_CREEP_SIZE) {
    return { error: C.ERR_INVALID_ARGS };
  }
  const cost = body.reduce((sum, part) => sum + C.BODYPART_COST[part], 0);
  const banks = [
    this,
    ...state.objects.filter(
      o =>
        o instanceof P.StructureExtension &&
        o.owner === this.owner &&
        getRange(this, o) <= C.SPAWN_RANGE,
    ),
  ];
  if (banks.reduce((sum, b) => sum + b.store.energy, 0) < cost) {
    return { error: C.ERR_NOT_ENOUGH_ENERGY };
  }
  let left = cost;
  for (const bank of banks) {
    const take = Math.min(bank.store.energy, left);
    bank.store.energy -= take;
    left -= take;
  }

  const creep = new P.Creep();
  Object.assign(creep, {
    id: nextId++,
    x: this.x,
    y: this.y,
    owner: this.owner,
    body: body.map(type => ({ type, hits: C.BODYPART_HITS })),
    hits: body.length * C.BODYPART_HITS,
    hitsMax: body.length * C.BODYPART_HITS,
    fatigue: 0,
    spawning: true,
    exists: true,
    store: makeStore(0, 0),
  });
  // The real API exposes the creep from the moment spawning starts, flagged
  // `spawning: true`, and bots key state off its id straight away.
  state.objects.push(creep);
  this.spawning = {
    needTime: body.length * C.CREEP_SPAWN_TIME,
    remainingTime: body.length * C.CREEP_SPAWN_TIME,
    creep,
    cancel: () => C.OK,
  };
  return { object: creep };
};

// --- tick resolution --------------------------------------------------------

const DELTA = {
  [C.TOP]: [0, -1],
  [C.TOP_RIGHT]: [1, -1],
  [C.RIGHT]: [1, 0],
  [C.BOTTOM_RIGHT]: [1, 1],
  [C.BOTTOM]: [0, 1],
  [C.BOTTOM_LEFT]: [-1, 1],
  [C.LEFT]: [-1, 0],
  [C.TOP_LEFT]: [-1, -1],
};

function direction(dx, dy) {
  for (const [dir, [x, y]] of Object.entries(DELTA)) if (x === dx && y === dy) return Number(dir);
  return C.TOP;
}

const terrainCost = (x, y) => (state.terrain[y * 100 + x] === 2 ? 10 : 2);

function blocked(x, y, owner) {
  if (state.terrain[y * 100 + x] === C.TERRAIN_WALL) return true;
  for (const object of state.objects) {
    if (object.x !== x || object.y !== y) continue;
    if (object instanceof P.StructureRampart) {
      // A rampart blocks everyone but its owner; a neutral one blocks nobody.
      if (object.owner !== null && object.owner !== owner) return true;
      continue;
    }
    if (
      object instanceof P.StructureWall ||
      object instanceof P.StructureSpawn ||
      object instanceof P.StructureExtension ||
      (object instanceof P.Creep && !object.spawning)
    ) {
      return true;
    }
  }
  return false;
}

export function beginTick() {
  state.tick += 1;
  intents.clear();
  for (const object of state.objects) {
    if (object instanceof P.Creep) {
      object.fatigue = Math.max(0, object.fatigue - 2 * parts(object, C.MOVE));
    }
    // The arena text says energy does not regenerate, but a replay shows the
    // spawn's own +1/tick trickle still applies.
    if (object instanceof P.StructureSpawn) {
      object.store.energy = Math.min(object.store.capacity, object.store.energy + 1);
    }
  }
}

export function endTick() {
  for (const [creep, record] of intents) {
    if (!record.direction || creep.fatigue > 0 || !creep.exists || creep.spawning) continue;
    const [dx, dy] = DELTA[record.direction] ?? [0, 0];
    const x = creep.x + dx;
    const y = creep.y + dy;
    if (x < 0 || x > 99 || y < 0 || y > 99) continue;
    if (blocked(x, y, creep.owner)) continue;
    creep.x = x;
    creep.y = y;
    const load = creep.body.filter(p => p.type !== C.MOVE && p.hits > 0).length;
    creep.fatigue += terrainCost(x, y) * load;
  }

  for (const spawn of state.objects.filter(o => o instanceof P.StructureSpawn)) {
    if (!spawn.spawning) continue;
    spawn.spawning.remainingTime -= 1;
    if (spawn.spawning.remainingTime > 0) continue;
    const creep = spawn.spawning.creep;
    const spot = freeTileNear(spawn, creep.owner);
    if (!spot) continue; // boxed in: hold the finished creep until a tile frees
    spawn.spawning = null;
    creep.x = spot.x;
    creep.y = spot.y;
    creep.spawning = false;
  }

  // Standing on a flag hands its whole rampart group to you.
  for (const flag of state.objects.filter(o => o instanceof P.Flag)) {
    const sitter = state.objects.find(
      o => o instanceof P.Creep && !o.spawning && o.x === flag.x && o.y === flag.y,
    );
    if (!sitter || sitter.owner === flag.owner) continue;
    state.events.push(
      `t${state.tick} flag (${flag.x},${flag.y}) [${flag.group}] taken by ${sitter.owner}` +
        `${flag.owner ? ` from ${flag.owner}` : ''}`,
    );
    flag.owner = sitter.owner;
    for (const rampart of state.objects) {
      if (rampart instanceof P.StructureRampart && rampart.group === flag.group) {
        rampart.owner = sitter.owner;
      }
    }
  }
}

function freeTileNear(object, owner) {
  for (const [dx, dy] of Object.values(DELTA)) {
    const x = object.x + dx;
    const y = object.y + dy;
    if (x < 0 || x > 99 || y < 0 || y > 99) continue;
    if (!blocked(x, y, owner)) return { x, y };
  }
  return null;
}

export { P, C, state, direction };
