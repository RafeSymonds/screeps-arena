import type { GameState } from "./types"
import { StrategyState } from "./types"

export function evaluateStrategy(state: GameState, previousStrategy: StrategyState): StrategyState {
    // Highest priority: protect our base
    // if (state.enemiesNearSpawn > 0) {
    //     return StrategyState.DEFEND_SPAWN
    // }

    // We do not hold center → take it
    if (
        (previousStrategy === StrategyState.ATTACK_SPAWN && state.outnumberedAtCenter) ||
        (previousStrategy !== StrategyState.ATTACK_SPAWN && !state.centerControlled)
    ) {
        return StrategyState.TAKE_CENTER
    }

    // We control center → decide if it's time to push
    const centerAdvantage = state.alliesNearCenter - state.enemiesNearCenter

    if (centerAdvantage >= 2) {
        return StrategyState.ATTACK_SPAWN
    }

    return previousStrategy
}
