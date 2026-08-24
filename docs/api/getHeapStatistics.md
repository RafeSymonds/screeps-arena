# getHeapStatistics()

Import from `game/utils`.

Use this method to get heap statistics for your virtual machine. The return value is almost identical to the Node.js function v8.getHeapStatistics. This function returns one additional property: externally_allocated_size which is the total amount of currently allocated memory which is not included in the v8 heap but counts against this isolate's memory limit. ArrayBuffer instances over a certain size are externally allocated and will be counted here.
