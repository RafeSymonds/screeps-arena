import { StrategyState, type GameState } from "./types"
import { SquadDirective } from "./types"

export function squadManager(state: GameState, strategy: StrategyState): SquadDirective {
    // Losing center fight → retreat
    if (state.outnumberedAtCenter) {
        return SquadDirective.RETREAT
    }

    // Winning but not grouped enough → wait
    if (strategy === StrategyState.HOLD_CENTER || strategy === StrategyState.TAKE_CENTER) {
        return SquadDirective.WAIT
    }

    // Good advantage → push
    return SquadDirective.PUSH
}
