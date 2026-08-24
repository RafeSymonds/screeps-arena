# searchPath()

Import from `game/path-finder`.

Find an optimal path between origin and goal. Note that searchPath without costMatrix specified (see below) uses terrain data only.

| parameter         | type   | description |
| ----------------- | ------ | ----------- |
| `origin`          | object | See below   |
| `goal`            | object | See below   |
| `opts (optional)` | object | See below   |

**Returns:** Returns an object containing the following properties:

- **path** — array — The path found as an array of objects containing x and y properties
- **ops** — number — Total number of operations performed before this path was calculated
- **cost** — number — The total cost of the path as derived from plainCost, swampCost, and given CostMatrix instance
- **incomplete** — boolean — If the pathfinder fails to find a complete path, this will be true
