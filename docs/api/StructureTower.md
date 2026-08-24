# StructureTower

`class extends OwnedStructure`

Import from `game/prototypes/tower`.

Remotely attacks game objects or heals creeps within its range. Its effectiveness linearly depends on the distance. Each action consumes energy.

- **cost** — 1250
- **hits** — 3000
- **capacity** — 10
- **cooldown** — 10 ticks
- **Action maximum range** — 20
- **Energy per action** — 10
- **Attack effectiveness** — Starts at 1000 at point-blank range and decreases by 50 for each additional tile
- **Heal effectiveness** — Starts at 600 at point-blank range and decreases by 30 for each additional tile

### cooldown

**Type:** `number`

The remaining amount of ticks while this tower cannot be used.

### store

**Type:** `Store`

A [Store](Store.md) object that contains cargo of this structure.

### attack()

Remotely attack any creep or structure in range.

| parameter | type                | description        |
| --------- | ------------------- | ------------------ |
| `target`  | `Creep` `Structure` | The target object. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this structure.
- **`ERR_NOT_ENOUGH_ENERGY`** — -6 — The tower does not have enough energy.
- **`ERR_INVALID_TARGET`** — -7 — The arguments provided are incorrect.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is not in range.
- **`ERR_TIRED`** — -11 — The tower is still cooling down.

### heal()

Remotely heal any creep in range.

| parameter | type    | description       |
| --------- | ------- | ----------------- |
| `target`  | `Creep` | The target creep. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this structure.
- **`ERR_NOT_ENOUGH_ENERGY`** — -6 — The tower does not have enough energy.
- **`ERR_INVALID_TARGET`** — -7 — The arguments provided are incorrect.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is not in range.
- **`ERR_TIRED`** — -11 — The tower is still cooling down.
