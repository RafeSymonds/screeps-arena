import type { Position } from "game/prototypes/game-object"

export enum StrategyState {
    DEFEND_SPAWN,
    TAKE_CENTER,
    HOLD_CENTER,
    ATTACK_SPAWN,
}

export enum SquadDirective {
    WAIT,
    PUSH,
    RETREAT,
}

export interface GameState {
    myCreeps: number
    enemyCreeps: number

    alliesNearCenter: number
    enemiesNearCenter: number

    centerControlled: boolean
    outnumberedAtCenter: boolean

    time: number
}

export enum ObjectiveType {
    OBJECTIVE_ATTACK,
    OBJECTIVE_MOVE,
}

export interface Objective {
    goal: Position
    type: ObjectiveType
}
