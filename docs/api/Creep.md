# Creep

`class extends GameObject`

Import from `game/prototypes/creep`.

Creeps are your units. Creeps can move, harvest energy, construct structures, attack another creeps, and perform other actions. Each creep consists of up to 50 body parts with the following possible types:

- **body part** — cost — Effect per one body part
- **`MOVE`** — `50` — Decreases fatigue by 2 points per tick.
- **`WORK`** — `100` — Harvests 2 energy units from a source per tick. Builds a structure for 5 energy units per tick.
- **`CARRY`** — `50` — Can contain up to 50 resource units.
- **`ATTACK`** — `80` — Attacks another creep/structure with 30 hits per tick in a short-ranged attack.
- **`RANGED_ATTACK`** — `150` — Attacks another single creep/structure with 10 hits per tick in a long-range attack up to 3 squares long. Attacks all hostile creeps/structures within 3 squares range with 1-4-10 hits (depending on the range).
- **`HEAL`** — `250` — Heals self or another creep restoring 12 hits per tick in short range or 4 hits per tick at a distance.
- **`TOUGH`** — `10` — No effect, just additional hit points to the creep's body.

### body

**Type:** `array`

An array describing the creep’s body. Each element contains the following properties:

- **type** — string — One of the body part types constants.
- **hits** — number — The remaining amount of hit points of this body part.

### fatigue

**Type:** `number`

The movement fatigue indicator. If it is greater than zero, the creep cannot move.

### hits

**Type:** `number`

The current amount of hit points of the creep.

### hitsMax

**Type:** `number`

The maximum amount of hit points of the creep.

### my

**Type:** `boolean`

Whether it is your creep.

### spawning

**Type:** `boolean`

Whether this creep is still being spawned.

### store

**Type:** `Store`

A [Store](Store.md) object that contains cargo of this creep.

### attack()

Attack another creep, structure, or construction site in a short-ranged attack. Requires the `ATTACK` body part. If the target is inside a rampart, then the rampart is attacked instead. The target has to be at adjacent square to the creep. This action cannot be executed on the same tick with `harvest`, `build`, `heal`, `rangedHeal`.

| parameter | type                                   | description        |
| --------- | -------------------------------------- | ------------------ |
| `target`  | `Creep` `Structure` `ConstructionSite` | The target object. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid attackable object.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_NO_BODYPART`** — -12 — There are no ATTACK body parts in this creep’s body.

### build()

Build a structure at the target construction site using carried energy. Requires `WORK` and `CARRY` body parts. The target has to be within 3 squares range of the creep. This action cannot be executed on the same tick with `harvest`, `attack`, `heal`, `rangedHeal`, `rangedAttack`, `rangedMassAttack`.

| parameter | type               | description                               |
| --------- | ------------------ | ----------------------------------------- |
| `target`  | `ConstructionSite` | The target construction site to be built. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_NOT_ENOUGH_RESOURCES`** — -6 — The creep does not have any carried energy.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid construction site object or the structure cannot be built here (probably because of an obstacle at the same square).
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_FULL`** — -8 — There is another construction site at the same location that's further along.
- **`ERR_NO_BODYPART`** — -12 — There are no WORK body parts in this creep’s body.

### drop()

Drop this resource on the ground.

| parameter           | type   | description                                                                                       |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `resourceType`      | string | One of the RESOURCE_* constants.                                                                  |
| `amount (optional)` | number | The amount of resource units to be dropped. If omitted, all the available carried amount is used. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_NOT_ENOUGH_RESOURCES`** — -6 — The creep does not have the given amount of resources.
- **`ERR_INVALID_ARGS`** — -10 — The resourceType is not a valid RESOURCE_* constant.

### harvest()

Harvest energy from the source. Requires the `WORK` body part. If the creep has an empty `CARRY` body part, the harvested resource is put into it; otherwise it is dropped on the ground. The target has to be at an adjacent square to the creep. This action cannot be executed on the same tick with `attack`, `build`, `heal`, `rangedHeal`.

| parameter | type     | description                 |
| --------- | -------- | --------------------------- |
| `target`  | `Source` | The object to be harvested. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_NOT_ENOUGH_RESOURCES`** — -6 — The target does not contain any harvestable resource.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid source object.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_NO_BODYPART`** — -12 — There are no WORK body parts in this creep’s body.

### heal()

Heal self or another creep. It will restore the target creep’s damaged body parts function and increase the hits counter. Requires the `HEAL` body part. The target has to be at adjacent square to the creep. This action cannot be executed on the same tick with `harvest`, `build`, `attack`, `rangedHeal`.

| parameter | type    | description              |
| --------- | ------- | ------------------------ |
| `target`  | `Creep` | The target creep object. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid creep object.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_NO_BODYPART`** — -12 — There are no HEAL body parts in this creep’s body.

### move()

Move the creep one square in the specified direction. Requires the `MOVE` body part.

| parameter   | type   | description                                                                                                       |
| ----------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `direction` | number | one of the following constants: `TOP` `TOP_RIGHT` `RIGHT` `BOTTOM_RIGHT` `BOTTOM` `BOTTOM_LEFT` `LEFT` `TOP_LEFT` |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_INVALID_ARGS`** — -10 — The provided direction is incorrect.
- **`ERR_TIRED`** — -11 — The fatigue indicator of the creep is non-zero.
- **`ERR_NO_BODYPART`** — -12 — There are no MOVE body parts in this creep’s body.

### moveTo()

Find the optimal path to the target and move to it. Requires the `MOVE` body part.

| parameter | type   | description                                                                 |
| --------- | ------ | --------------------------------------------------------------------------- |
| `target`  | object | Can be a `GameObject` or any object containing x and y properties.          |
| `opts`    | object | An object with additional options that are passed to game/utils `findPath`. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_TIRED`** — -11 — The fatigue indicator of the creep is non-zero.
- **`ERR_NO_BODYPART`** — -12 — There are no MOVE body parts in this creep’s body.

### pickup()

Pick up an item (a dropped piece of resource). Requires the `CARRY` body part. The target has to be at adjacent square to the creep or at the same square.

| parameter | type       | description                        |
| --------- | ---------- | ---------------------------------- |
| `target`  | `Resource` | The target object to be picked up. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid creep object.
- **`ERR_FULL`** — -8 — The creep cannot receive any more resource.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.

### pull()

Help another creep to follow this creep. The fatigue generated for the target's move will be added to the creep instead of the target. Requires the `MOVE` body part. The target has to be at adjacent square to the creep. The creep must move elsewhere, and the target must move towards the creep.

| parameter | type    | description       |
| --------- | ------- | ----------------- |
| `target`  | `Creep` | The target creep. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid creep object.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.

### rangedAttack()

A ranged attack against another creep or structure. Requires the `RANGED_ATTACK` body part. If the target is inside a rampart, the rampart is attacked instead. The target has to be within 3 squares range of the creep. This action cannot be executed on the same tick with `rangedMassAttack`, `rangedHeal`, `build`.

| parameter | type                | description                          |
| --------- | ------------------- | ------------------------------------ |
| `target`  | `Creep` `Structure` | The target object to be attacked up. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid attackable object.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_NO_BODYPART`** — -12 — There are no `RANGED_ATTACK` body parts in this creep’s body.

### rangedHeal()

Heal another creep at a distance. It will restore the target creep’s damaged body parts function and increase the hits counter. Requires the `HEAL` body part. The target has to be within 3 squares range of the creep. This action cannot be executed on the same tick with `harvest`, `build`, `heal`, `attack`, `rangedAttack`, `rangedMassAttack`.

| parameter | type    | description              |
| --------- | ------- | ------------------------ |
| `target`  | `Creep` | The target creep object. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid attackable object.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_NO_BODYPART`** — -12 — There are no `HEAL` body parts in this creep’s body.

### rangedMassAttack()

A ranged attack against all hostile creeps or structures within 3 squares range. Requires the `RANGED_ATTACK` body part. The attack power depends on the range to each target. Friendly units are not affected. This action cannot be executed on the same tick with `rangedAttack`, `rangedHeal`, `build`.

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_NO_BODYPART`** — -12 — There are no `RANGED_ATTACK` body parts in this creep’s body.

### transfer()

Transfer resource from the creep to another object. The target has to be at adjacent square to the creep.

| parameter           | type                | description                                                                                      |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `target`            | `Creep` `Structure` | The target object.                                                                               |
| `resourceType`      | string              | One of the RESOURCE_* constants.                                                                 |
| `amount (optional)` | number              | The amount of resources to be transferred. If omitted, all the available carried amount is used. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_NOT_ENOUGH_RESOURCES`** — -6 — The creep does not have the given amount of resources.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid object which can contain the specified resource.
- **`ERR_FULL`** — -8 — The target cannot receive any more resources.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_INVALID_ARGS`** — -10 — The resourceType is not one of the RESOURCE_* constants, or the amount is incorrect.

### withdraw()

Withdraw resources from a structure. The target has to be at adjacent square to the creep. Multiple creeps can withdraw from the same object in the same tick. Your creeps can withdraw resources from hostile structures as well, in case if there is no hostile rampart on top of it.

| parameter           | type        | description                                                                                      |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `target`            | `Structure` | The target structure.                                                                            |
| `resourceType`      | string      | One of the RESOURCE_* constants.                                                                 |
| `amount (optional)` | number      | The amount of resources to be transferred. If omitted, all the available carried amount is used. |

**Returns:** Return one of the following codes:

- **`OK`** — 0 — The operation has been scheduled successfully.
- **`ERR_NOT_OWNER`** — -1 — You are not the owner of this creep.
- **`ERR_NOT_ENOUGH_RESOURCES`** — -6 — The target does not have the given amount of resources.
- **`ERR_INVALID_TARGET`** — -7 — The target is not a valid object which can contain the specified resource.
- **`ERR_FULL`** — -8 — The creep's store is full.
- **`ERR_NOT_IN_RANGE`** — -9 — The target is too far away.
- **`ERR_INVALID_ARGS`** — -10 — The resourceType is not one of the RESOURCE_* constants, or the amount is incorrect.
