# StructureSpawn

`class extends OwnedStructure`

Import from `game/prototypes/spawn`.

This structure can create creeps. It also auto-regenerate a little amount of energy each tick.

- **cost** — 1000
- **hits** — 3000
- **capacity** — 1000
- **Spawn time** — 3 ticks per each body part

### directions

**Type:** `array<number>`

An array with the direction constants:`TOP` `TOP_RIGHT` `RIGHT` `BOTTOM_RIGHT` `BOTTOM` `BOTTOM_LEFT` `LEFT` `TOP_LEFT`

### spawning

**Type:** `Spawning`

If the spawn is in process of spawning a new creep, this object will contain a [Spawning](Spawning.md) object, or null otherwise.

### store

**Type:** `Store`

A [Store](Store.md) object that contains cargo of this structure.

### setDirections()

Set desired directions where creeps should move when spawned.

| parameter    | type          | description                                                                                                             |
| ------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `directions` | array<number> | An array with the direction constants:`TOP` `TOP_RIGHT` `RIGHT` `BOTTOM_RIGHT` `BOTTOM` `BOTTOM_LEFT` `LEFT` `TOP_LEFT` |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this structure.
- **`ERR_INVALID_ARGS`** — -10 — The array contains invalid directions.

### spawnCreep()

Start the creep spawning process. The required energy amount can be withdrawn from your spawns and extensions within `SPAWN_RANGE` range.

| parameter | type          | description                                                                                                                                                          |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body`    | array<string> | An array describing the new creep’s body. Should contain 1 to 50 elements with one of these constants: `WORK` `MOVE` `CARRY` `ATTACK` `RANGED_ATTACK` `HEAL` `TOUGH` |

**Returns:** Return an object with one of the following properties:

- **error** — number — One of the ERR_* constants
- **object** — `Creep` — Instance of the creep being spawned

Possible error codes:

- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this structure.
- **`ERR_BUSY`** — -4 — The spawn is already in process of spawning another creep.
- **`ERR_NOT_ENOUGH_ENERGY`** — -6 — The spawn and its extensions contain not enough energy to create a creep with the given body.
- **`ERR_INVALID_ARGS`** — -10 — Body is not properly described.
