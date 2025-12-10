// Auto-generated via npm run build. Edit files in src/ only.

import { Creep, StructureSpawn, getTicks, MOVE, ATTACK, findClosestByRange, ERR_NOT_IN_RANGE } from 'game';
import { getObjectsByPrototype, findInRange } from 'game/utils';

var StrategyState;
(function (StrategyState) {
    StrategyState[StrategyState["DEFEND_SPAWN"] = 0] = "DEFEND_SPAWN";
    StrategyState[StrategyState["TAKE_CENTER"] = 1] = "TAKE_CENTER";
    StrategyState[StrategyState["HOLD_CENTER"] = 2] = "HOLD_CENTER";
    StrategyState[StrategyState["ATTACK_SPAWN"] = 3] = "ATTACK_SPAWN";
})(StrategyState || (StrategyState = {}));
var SquadDirective;
(function (SquadDirective) {
    SquadDirective[SquadDirective["WAIT"] = 0] = "WAIT";
    SquadDirective[SquadDirective["PUSH"] = 1] = "PUSH";
    SquadDirective[SquadDirective["RETREAT"] = 2] = "RETREAT";
})(SquadDirective || (SquadDirective = {}));
var ObjectiveType;
(function (ObjectiveType) {
    ObjectiveType[ObjectiveType["OBJECTIVE_ATTACK"] = 0] = "OBJECTIVE_ATTACK";
    ObjectiveType[ObjectiveType["OBJECTIVE_MOVE"] = 1] = "OBJECTIVE_MOVE";
})(ObjectiveType || (ObjectiveType = {}));

function get_creeps() {
    return getObjectsByPrototype(Creep);
}
function get_my_creeps() {
    return get_creeps().filter((creep) => creep.my);
}
function get_enemy_creeps() {
    return get_creeps().filter((creep) => !creep.my);
}
function get_my_spawn() {
    return getObjectsByPrototype(StructureSpawn).find((spawn) => spawn.my);
}
function get_enemy_spawn() {
    return getObjectsByPrototype(StructureSpawn).find((spawn) => !spawn.my);
}

const CENTER_POS = { x: 50, y: 50 };
function objectiveManager(state, strategy) {
    const mySpawn = get_my_spawn();
    switch (strategy) {
        case StrategyState.DEFEND_SPAWN:
            return { goal: { x: mySpawn.x, y: mySpawn.y }, type: ObjectiveType.OBJECTIVE_MOVE };
        case StrategyState.TAKE_CENTER:
        case StrategyState.HOLD_CENTER:
            return { goal: CENTER_POS, type: ObjectiveType.OBJECTIVE_MOVE };
        case StrategyState.ATTACK_SPAWN:
            const enemySpawn = get_enemy_spawn();
            if (enemySpawn)
                return {
                    goal: { x: enemySpawn.x, y: enemySpawn.y },
                    type: ObjectiveType.OBJECTIVE_ATTACK,
                };
    }
    // fallback
    return { goal: CENTER_POS, type: ObjectiveType.OBJECTIVE_MOVE };
}

function scanPerception() {
    const CENTER_POS = { x: 50, y: 50 };
    const CENTER_RADIUS = 10;
    const myCreeps = get_my_creeps();
    const enemyCreeps = get_enemy_creeps();
    const alliesCenter = findInRange(CENTER_POS, myCreeps, CENTER_RADIUS).length;
    const enemiesCenter = findInRange(CENTER_POS, enemyCreeps, CENTER_RADIUS).length;
    return {
        myCreeps: myCreeps.length,
        enemyCreeps: enemyCreeps.length,
        alliesNearCenter: alliesCenter,
        enemiesNearCenter: enemiesCenter,
        centerControlled: alliesCenter > enemiesCenter,
        outnumberedAtCenter: alliesCenter < enemiesCenter,
        time: getTicks(),
    };
}

function spawnManager(state, strategy) {
    const spawn = get_my_spawn();
    if (!spawn || spawn.spawning)
        return;
    const MAX_UNITS = 6;
    const myUnits = state.myCreeps;
    if (myUnits >= MAX_UNITS)
        return;
    // Simple fighter for now
    const body = [MOVE, MOVE, ATTACK, ATTACK];
    spawn.spawnCreep(body);
}

function squadManager(state, strategy) {
    // Losing center fight → retreat
    if (state.outnumberedAtCenter) {
        return SquadDirective.RETREAT;
    }
    // Winning but not grouped enough → wait
    if (strategy === StrategyState.HOLD_CENTER || strategy === StrategyState.TAKE_CENTER) {
        return SquadDirective.WAIT;
    }
    // Good advantage → push
    return SquadDirective.PUSH;
}

function evaluateStrategy(state, previousStrategy) {
    // Highest priority: protect our base
    // if (state.enemiesNearSpawn > 0) {
    //     return StrategyState.DEFEND_SPAWN
    // }
    // We do not hold center → take it
    if ((previousStrategy === StrategyState.ATTACK_SPAWN && state.outnumberedAtCenter) ||
        (previousStrategy !== StrategyState.ATTACK_SPAWN && !state.centerControlled)) {
        return StrategyState.TAKE_CENTER;
    }
    // We control center → decide if it's time to push
    const centerAdvantage = state.alliesNearCenter - state.enemiesNearCenter;
    if (centerAdvantage >= 2) {
        return StrategyState.ATTACK_SPAWN;
    }
    return previousStrategy;
}

// core/tactics.ts
function runTactics(creep, directive, objective, state, enemyCreeps) {
    const enemy = findClosestByRange(creep, enemyCreeps);
    // Retreat condition:
    if (directive === SquadDirective.RETREAT) {
        const spawn = get_my_spawn();
        return creep.moveTo(spawn);
    }
    // Regroup condition:
    if (directive === SquadDirective.WAIT) {
        // Stay near the center rally area or spawn if center not reached
        return creep.moveTo(objective.goal);
    }
    // Engage enemies if in range:
    if (enemy) {
        if (creep.attack(enemy) === ERR_NOT_IN_RANGE) {
            creep.moveTo(enemy);
        }
        return;
    }
    if (objective.type == ObjectiveType.OBJECTIVE_ATTACK) {
        let target = get_enemy_spawn();
        if (target) {
            if (creep.attack(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(objective.goal);
            }
        }
    }
}

var previousStrategy = StrategyState.DEFEND_SPAWN;
function loop() {
    const state = scanPerception();
    let strategy = evaluateStrategy(state, previousStrategy);
    spawnManager(state, strategy);
    const directive = squadManager(state, strategy);
    const objective = objectiveManager(state, strategy);
    console.log(state, directive, objective);
    const myCreeps = get_my_creeps();
    const enemyCreeps = get_enemy_creeps();
    myCreeps.forEach((creep) => {
        runTactics(creep, directive, objective, state, enemyCreeps);
    });
    previousStrategy = strategy;
}

export { loop };
