import { Creep } from "game"
import { getObjectsByPrototype } from "game/utils"

export function get_my_creeps(): Creep[] {
    return getObjectsByPrototype(Creep).filter((creep) => creep.my)
}

export function get_enemy_creeps(): Creep[] {
    return getObjectsByPrototype(Creep).filter((creep) => !creep.my)
}
