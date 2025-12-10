// managers/spawnManager.ts
import type { GameState } from "./types"
import { StrategyState } from "./types"
import { get_my_creeps, get_my_spawn } from "./utils"

import { ATTACK, MOVE } from "game"

export function spawnManager(state: GameState, strategy: StrategyState) {
    const spawn = get_my_spawn()

    if (!spawn || spawn.spawning) return

    const MAX_UNITS = 6
    const myUnits = state.myCreeps

    if (myUnits >= MAX_UNITS) return

    // Simple fighter for now
    const body = [ATTACK, ATTACK, MOVE]

    spawn.spawnCreep(body)
}
