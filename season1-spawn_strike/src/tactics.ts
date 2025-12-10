// core/tactics.ts

import type { GameState, Objective } from "./types"
import { ObjectiveType, SquadDirective } from "./types"

import { Creep, ERR_NOT_IN_RANGE, findClosestByRange, getObjectById } from "game"
import { get_enemy_creeps, get_enemy_spawn, get_my_spawn } from "./utils"

export function runTactics(
    creep: Creep,
    directive: SquadDirective,
    objective: Objective,
    state: GameState,

    enemyCreeps: Creep[],
) {
    const enemy = findClosestByRange(creep, enemyCreeps)

    // Retreat condition:
    if (directive === SquadDirective.RETREAT) {
        const spawn = get_my_spawn()

        return creep.moveTo(spawn)
    }

    // Regroup condition:
    if (directive === SquadDirective.WAIT) {
        // Stay near the center rally area or spawn if center not reached
        return creep.moveTo(objective.goal)
    }

    // Engage enemies if in range:
    if (enemy) {
        if (creep.attack(enemy) === ERR_NOT_IN_RANGE) {
            creep.moveTo(enemy)
        }
        return
    }

    if (objective.type == ObjectiveType.OBJECTIVE_ATTACK) {
        let target = get_enemy_spawn()

        if (target) {
            if (creep.attack(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(objective.goal)
            }
        }
    }
}
