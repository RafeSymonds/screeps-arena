import type { GameState } from "./types"
import { StrategyState } from "./types"

export function evaluateStrategy(state: GameState): StrategyState {
    // Highest priority: protect our base
    // if (state.enemiesNearSpawn > 0) {
    //     return StrategyState.DEFEND_SPAWN
    // }

    // We do not hold center → take it
    if (!state.centerControlled) {
        return StrategyState.TAKE_CENTER
    }

    // We control center → decide if it's time to push
    const centerAdvantage = state.alliesNearCenter - state.enemiesNearCenter

    if (centerAdvantage >= 2) {
        return StrategyState.ATTACK_SPAWN
    }

    // Holding center but not enough advantage yet
    return StrategyState.HOLD_CENTER
}
