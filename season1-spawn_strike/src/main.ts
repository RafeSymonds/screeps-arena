import { objectiveManager } from "./objectiveManager"
import { scanPerception } from "./perception"
import { spawnManager } from "./spawnManager"
import { squadManager } from "./squadManager"
import { evaluateStrategy } from "./strategy"

export function loop(): void {
    const state = scanPerception()
    const strategy = evaluateStrategy(state)

    spawnManager(state, strategy)
    const directive = squadManager(state)
    const objective = objectiveManager(state, strategy)
}
