# findClosestByRange()

Import from `game/utils`.

Find a position with the shortest linear distance from the given position.

| parameter   | type   | description                                                                                              |
| ----------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `fromPos`   | object | The position to search from. May be `GameObject` or any object containing x and y properties.            |
| `positions` | array  | The positions to search among. An array with `GameObject`s or any objects containing x and y properties. |

**Returns:** Returns the closest object from **positions**, or null if there was no valid positions.
