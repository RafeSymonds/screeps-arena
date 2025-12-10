import type { GameState } from "./types"
import { SquadDirective } from "./types"

export function squadManager(state: GameState): SquadDirective {
    // Losing center fight → retreat
    if (state.outnumberedAtCenter) {
        return SquadDirective.RETREAT
    }

    // Winning but not grouped enough → wait
    if (state.alliesNearCenter < 4) {
        return SquadDirective.WAIT
    }

    // Good advantage → push
    return SquadDirective.PUSH
}
