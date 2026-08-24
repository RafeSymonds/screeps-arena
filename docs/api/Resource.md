# Resource

`class extends GameObject`

Import from `game/prototypes/resource`.

A dropped piece of resource. It will decay after a while if not picked up. Dropped resource pile decays for ceil(amount/1000) units per tick.

### amount

**Type:** `number`

The amount of dropped resource.

### resourceType

**Type:** `string`

One of the RESOURCE_* constants.
