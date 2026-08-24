# Store

`object`

Import from `game/prototypes/store`.

An object that class contain resources in its cargo.

There are two types of stores in the game: general-purpose stores and limited stores.

- General purpose stores can contain any resource within their capacity (e.g. creeps or containers).
- Limited stores can contain only a few types of resources needed for that particular object (e.g. spawns, extensions, towers).

You can get specific resources from the store by addressing them as object properties:

### getCapacity()

Returns capacity of this store for the specified resource. For a general-purpose store, it returns total capacity if resource is undefined.

| parameter             | type              | description |
| --------------------- | ----------------- | ----------- |
| `resource (optional)` | `RESOURCE_ENERGY` |             |

### getFreeCapacity()

Returns free capacity for the store. For a limited store, it returns the capacity available for the specified resource if resource is defined and valid for this store.

| parameter             | type              | description |
| --------------------- | ----------------- | ----------- |
| `resource (optional)` | `RESOURCE_ENERGY` |             |

### getUsedCapacity()

Returns the capacity used by the specified resource. For a general-purpose store, it returns total used capacity if resource is undefined.

| parameter             | type              | description |
| --------------------- | ----------------- | ----------- |
| `resource (optional)` | `RESOURCE_ENERGY` |             |
