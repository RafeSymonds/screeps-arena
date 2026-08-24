# ConstructionSite

`class extends GameObject`

Import from `game/prototypes/game-object`.

A site of a structure which is currently under construction. To build a structure on the construction site, give a worker creep some amount of energy and perform the [Creep](Creep.md).`build` action.

### my

**Type:** `boolean`

Whether it is your construction site.

### progress

**Type:** `number`

The current construction progress.

### progressTotal

**Type:** `number`

The total construction progress needed for the structure to be built.

### structure

**Type:** `Structure`

The structure that will be built (when the construction site is completed)

### remove()

Remove this construction site.
