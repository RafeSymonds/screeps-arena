# Spawning

`object`

Import from `game/prototypes/spawn`.

Details of the creep being spawned currently that can be addressed by the `StructureSpawn.spawning` property.

### creep

**Type:** `Creep`

The creep that being spawned.

### needTime

**Type:** `number`

Time needed in total to complete the spawning.

### remainingTime

**Type:** `number`

Remaining time to go.

### cancel()

Cancel spawning immediately. Energy spent on spawning is not returned.

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this spawn.
