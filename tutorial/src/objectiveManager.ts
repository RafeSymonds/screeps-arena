// managers/objectiveManager.ts
import type { Objective, GameState } from "./types"
import { StrategyState, SquadDirective } from "./types"

import type { Position } from "game/prototypes/game-object"
import { get_enemy_creeps, get_enemy_spawn, get_my_spawn } from "./utils"
import { findClosestByRange } from "game"

const CENTER_POS: Position = { x: 50, y: 50 }

export function objectiveManager(state: GameState, strategy: StrategyState): Objective {
    const mySpawn = get_my_spawn()

    switch (strategy) {
        case StrategyState.DEFEND_SPAWN:
            return { goal: { x: mySpawn!.x, y: mySpawn!.y } }

        case StrategyState.TAKE_CENTER:
        case StrategyState.HOLD_CENTER:
            return { goal: CENTER_POS }

        case StrategyState.ATTACK_SPAWN:
            const enemySpawn = get_enemy_spawn()

            if (enemySpawn) return { goal: { x: enemySpawn!.x, y: enemySpawn!.y } }
    }

    // fallback
    return { goal: CENTER_POS }
}
