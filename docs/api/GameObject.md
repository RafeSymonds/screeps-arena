# GameObject

`class`

Import from `game/prototypes/game-object`.

Basic prototype for game objects. All objects and classes are inherited from this class.

### controlledBy

**Type:** `Flag`

Returns the flag object that controls this game object.

### effects

**Type:** `Effect[] | null`

An array of [Effect](Effect.md) objects applied to this game object, or null if it has no effects.

### exists

**Type:** `boolean`

Returns true if this object is live in the game at the moment. Check this property to verify cached or newly created object instances.

### id

**Type:** `string`

The unique ID of this object that you can use in game/utils [getObjectById](getObjectById.md).

### ticksToDecay

**Type:** `number`

If defined, then this object will disappear after this number of ticks.

### x

**Type:** `number`

The X coordinate in the room.

### y

**Type:** `number`

The Y coordinate in the room.

### findClosestByPath()

Find a position with the shortest path from this game object. (See game/utils [findClosestByPath](findClosestByPath.md).)

| parameter         | type   | description                                                                                              |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `positions`       | array  | The positions to search among. An array with `GameObject`s or any objects containing x and y properties. |
| `opts (optional)` | object | An object containing additional pathfinding flags supported by `searchPath` method.                      |

**Returns:** Returns the closest object from **positions**, or null if there was no valid positions.

### findClosestByRange()

Find a position with the shortest linear distance from this game object. (See game/utils [findClosestByRange](findClosestByRange.md)).

| parameter   | type  | description                                                                                              |
| ----------- | ----- | -------------------------------------------------------------------------------------------------------- |
| `positions` | array | The positions to search among. An array with `GameObject`s or any objects containing x and y properties. |

**Returns:** Returns the closest object from **positions**.

### findInRange()

Find all objects in the specified linear range. See game/utils [findInRange](findInRange.md).

| parameter   | type   | description                                                                                        |
| ----------- | ------ | -------------------------------------------------------------------------------------------------- |
| `positions` | array  | The positions to search. An array with `GameObject`s or any objects containing x and y properties. |
| `range`     | number | The range distance.                                                                                |

**Returns:** Returns an array with the objects found.

### findPathTo()

Find a path from this object to the given position.

| parameter         | type   | description                                                                 |
| ----------------- | ------ | --------------------------------------------------------------------------- |
| `pos`             | object | An object containing **x** and **y**.                                       |
| `opts (optional)` | object | An object with additional options that are passed to game/utils `findPath`. |

**Returns:** Returns the path found as an array of objects containing x and y properties

### getRangeTo()

See game/utils [getRange](getRange.md).

| parameter | type   | description                           |
| --------- | ------ | ------------------------------------- |
| `pos`     | object | An object containing **x** and **y**. |
