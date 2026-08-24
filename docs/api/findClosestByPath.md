# findClosestByPath()

Import from `game/utils`.

Find a position with the shortest path from the given position.

| parameter         | type   | description                                                                                              |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `fromPos`         | object | The position to search from. May be `GameObject` or any object containing x and y properties.            |
| `positions`       | array  | The positions to search among. An array with `GameObject`s or any objects containing x and y properties. |
| `opts (optional)` | object | An object containing additional pathfinding flags supported by **searchPath** method.                    |

**Returns:** The closest object if found, null otherwise.
