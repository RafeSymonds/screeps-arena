// Auto-generated via npm run build. Edit files in src/ only.

import { Creep, StructureSpawn, getTicks, ATTACK, MOVE } from 'game';
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
            return { goal: { x: mySpawn.x, y: mySpawn.y } };
        case StrategyState.TAKE_CENTER:
        case StrategyState.HOLD_CENTER:
            return { goal: CENTER_POS };
        case StrategyState.ATTACK_SPAWN:
            const enemySpawn = get_enemy_spawn();
            if (enemySpawn)
                return { goal: { x: enemySpawn.x, y: enemySpawn.y } };
    }
    // fallback
    return { goal: CENTER_POS };
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
    const body = [ATTACK, ATTACK, MOVE];
    spawn.spawnCreep(body);
}

function squadManager(state) {
    // Losing center fight → retreat
    if (state.outnumberedAtCenter) {
        return SquadDirective.RETREAT;
    }
    // Winning but not grouped enough → wait
    if (state.alliesNearCenter < 4) {
        return SquadDirective.WAIT;
    }
    // Good advantage → push
    return SquadDirective.PUSH;
}

function evaluateStrategy(state) {
    // Highest priority: protect our base
    // if (state.enemiesNearSpawn > 0) {
    //     return StrategyState.DEFEND_SPAWN
    // }
    // We do not hold center → take it
    if (!state.centerControlled) {
        return StrategyState.TAKE_CENTER;
    }
    // We control center → decide if it's time to push
    const centerAdvantage = state.alliesNearCenter - state.enemiesNearCenter;
    if (centerAdvantage >= 2) {
        return StrategyState.ATTACK_SPAWN;
    }
    // Holding center but not enough advantage yet
    return StrategyState.HOLD_CENTER;
}

function loop() {
    const state = scanPerception();
    const strategy = evaluateStrategy(state);
    spawnManager(state, strategy);
    const directive = squadManager(state);
    const objective = objectiveManager(state, strategy);
    console.log(state, directive, objective);
}

export { loop };
