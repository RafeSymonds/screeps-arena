# CostMatrix

`class`

Import from `game/path-finder`.

Container for custom navigation cost data. If a non-0 value is found in the CostMatrix then that value will be used instead of the default terrain cost.

### clone()

Copy this [CostMatrix](CostMatrix.md) into a new [CostMatrix](CostMatrix.md) with the same data and return new [CostMatrix](CostMatrix.md)

### constructor()

Creates a new [CostMatrix](CostMatrix.md) containing 0's for all positions.

### get()

Get the cost of a position in this [CostMatrix](CostMatrix.md).

| parameter | type   | description                |
| --------- | ------ | -------------------------- |
| `x`       | number | The X position in the game |
| `y`       | number | The Y position in the game |

### set()

Set the cost of a position in this [CostMatrix](CostMatrix.md).

| parameter | type   | description                                                                                                                                                            |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x`       | number | The X position in the game                                                                                                                                             |
| `y`       | number | The Y position in the game                                                                                                                                             |
| `cost`    | number | Cost of this position. Must be a whole number. A cost of 0 will use the terrain cost for that tile. A cost greater than or equal to 255 will be treated as unwalkable. |
