import { getTicks } from "game"

import { get_enemy_creeps, get_my_creeps } from "./utils"
import { findInRange } from "game/utils"
import type { Position } from "game/prototypes/game-object"

import type { GameState } from "./types"

export function scanPerception(): GameState {
    const CENTER_POS: Position = { x: 50, y: 50 }

    const CENTER_RADIUS = 10

    const myCreeps = get_my_creeps()
    const enemyCreeps = get_enemy_creeps()

    const alliesCenter = findInRange(CENTER_POS, myCreeps, CENTER_RADIUS).length
    const enemiesCenter = findInRange(CENTER_POS, enemyCreeps, CENTER_RADIUS).length

    return {
        myCreeps: myCreeps.length,
        enemyCreeps: enemyCreeps.length,

        alliesNearCenter: alliesCenter,
        enemiesNearCenter: enemiesCenter,

        centerControlled: alliesCenter > enemiesCenter,
        outnumberedAtCenter: alliesCenter < enemiesCenter,

        time: getTicks(),
    }
}
