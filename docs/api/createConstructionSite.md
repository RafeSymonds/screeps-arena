# createConstructionSite()

Import from `game/utils`.

Create new [ConstructionSite](ConstructionSite.md) at the specified location.

| parameter   | type   | description                           |
| ----------- | ------ | ------------------------------------- |
| `position`  | object | An object with x and y properties.    |
| `prototype` | class  | A prototype that extends `Structure`. |

**Returns:** Returns an object with one of the following properties:

- **error** — number — one of the ERR_* constants
- **object** — `ConstructionSite` — the instance of `ConstructionSite` created by this call

Possible error codes:

- **`ERR_INVALID_ARGS`** — -10 — The location or the structure prototype is incorrect.
- **`ERR_INVALID_TARGET`** — -7 — The structure cannot be placed at the specified location.
- **`ERR_FULL`** — -8 — You have too many construction sites. The maximum number of construction sites per player is 10.
