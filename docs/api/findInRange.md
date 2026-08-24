# findInRange()

Import from `game/utils`.

Find all objects in the specified linear range.

| parameter   | type   | description                                                                                        |
| ----------- | ------ | -------------------------------------------------------------------------------------------------- |
| `fromPos`   | object | The origin position. May be `GameObject` or any object containing x and y properties.              |
| `positions` | array  | The positions to search. An array with `GameObject`s or any objects containing x and y properties. |
| `range`     | number | The range distance.                                                                                |

**Returns:** Returns an array with the objects found.
