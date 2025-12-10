import { Creep, StructureSpawn } from "game"
import { getObjectsByPrototype } from "game/utils"

export function get_creeps(): Creep[] {
    return getObjectsByPrototype(Creep)
}

export function get_my_creeps(): Creep[] {
    return get_creeps().filter((creep) => creep.my)
}

export function get_enemy_creeps(): Creep[] {
    return get_creeps().filter((creep) => !creep.my)
}

export function get_my_spawn(): StructureSpawn | undefined {
    return getObjectsByPrototype(StructureSpawn).find((spawn) => spawn.my)
}

export function get_enemy_spawn(): StructureSpawn | undefined {
    return getObjectsByPrototype(StructureSpawn).find((spawn) => !spawn.my)
}
