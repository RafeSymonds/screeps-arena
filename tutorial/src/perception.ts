import { getTicks } from "game"

import { Creep } from "game/prototypes"
import { get_enemy_creeps, get_my_creeps } from "./utils"
import { findInRange } from "game/utils"

export class GameReport {
    myCreeps: Creep[]
    enemyCreeps: Creep[]

    alliesNearCenter: number
    enemiesNearCenter: number

    time: number

    constructor() {
        this.myCreeps = get_my_creeps()

        this.enemyCreeps = get_enemy_creeps()

        let creepsAtCenter: Creep[] = findInRange({ x: 50, y: 50 }, [], 10)

        this.alliesNearCenter = creepsAtCenter.filter((creep) => creep.my).length
        this.enemiesNearCenter = creepsAtCenter.length - this.alliesNearCenter

        this.time = getTicks()
    }
}
