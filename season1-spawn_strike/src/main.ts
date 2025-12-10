import { objectiveManager } from "./objectiveManager"
import { scanPerception } from "./perception"
import { spawnManager } from "./spawnManager"
import { squadManager } from "./squadManager"
import { evaluateStrategy } from "./strategy"
import { runTactics } from "./tactics"
import { StrategyState } from "./types"
import { get_enemy_creeps, get_my_creeps } from "./utils"

var previousStrategy = StrategyState.DEFEND_SPAWN

export function loop(): void {
    const state = scanPerception()
    let strategy = evaluateStrategy(state, previousStrategy)

    spawnManager(state, strategy)
    const directive = squadManager(state, strategy)
    const objective = objectiveManager(state, strategy)

    console.log(state, directive, objective)

    const myCreeps = get_my_creeps()
    const enemyCreeps = get_enemy_creeps()

    myCreeps.forEach((creep) => {
        runTactics(creep, directive, objective, state, enemyCreeps)
    })

    previousStrategy = strategy
}
