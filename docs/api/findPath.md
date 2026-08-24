# findPath()

Import from `game/utils`.

Find an optimal path between fromPos and toPos. Unlike [searchPath](searchPath.md), findPath avoid all obstacles by default (unless costMatrix is specified).

| parameter         | type   | description                                                                                                                                                                           |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fromPos`         | object | The start position. May be `GameObject` or any object containing x and y properties.                                                                                                  |
| `toPos`           | object | The target position. May be `GameObject` or any object containing x and y properties.                                                                                                 |
| `opts (optional)` | object | An object containing additional pathfinding flags: * ignore array (objects which should not be treated as obstacles during the search) * Any options supported by `searchPath` method |

**Returns:** Returns the path found as an array of objects containing x and y properties
