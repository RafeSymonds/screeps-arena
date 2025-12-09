class CreepState {}
var creepState: CreepState

export function loop(): void {
    // Your code goes here
    console.log("hi")
    console.log("hi")
    console.log("hi")
    console.log("hi")
    console.log("hi")

    // var constructionSite = utils.getObjectsByPrototype(prototypes.ConstructionSite).find(i => i.my)
    // if(!constructionSite) {
    //         utils.createConstructionSite({x:50,y:55}, prototypes.StructureTower);
    //     }
    // let creeps = getObjectsByPrototype(Creep)
    // let myCreeps = creeps.filter(creep => creep.my)
    // let container = getObjectsByPrototype(StructureContainer)[0]
    // myCreeps.forEach(creep => {
    //     if(mining){
    //         if(creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
    //             mining = false
    //         }
    //         if(creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
    //             creep.moveTo(container)
    //         }
    //     }
    //     else{
    //         if(creep.store.getUsedCapacity(RESOURCE_ENERGY) == 0){
    //             mining = true
    //         }
    //         if(creep.build(constructionSite)){
    //             creep.moveTo(constructionSite)
    //         }
    //     }
    // })
    // let flags = utils.getObjectsByPrototype(prototypes.Flag);
    // console.log(spawn.spawning);
    // console.log(spawn.spawning === undefined);
    // if(!c1){
    //     c1 = spawn.spawnCreep([constants.MOVE]).object;
    // }
    // else{
    //             c1.moveTo(flags[0]);
    //     console.log("here")
    //     if(!c2) {
    //         c2= spawn.spawnCreep([constants.MOVE]).object;
    //     } else {
    //         c2.moveTo(flags[1]);
    //     }
    // }
    // if(c1 && !c1.spawning){
    //     c1.moveTo(flags[0])
    // }
    // if(c2 && !c2.spawning){
    //     c2.moveTo(flags[1])
    // }
    // let enemyCreeps = creeps.filter(creep => !creep.my)
    // const tower = utils.getObjectsByPrototype(prototypes.StructureTower)[0];
    // const container = utils.getObjectsByPrototype(prototypes.StructureContainer)[0];
    // console.log(tower.store.getFreeCapacity(constants.RESOURCE_ENERGY));
    // if (tower.store.getFreeCapacity(constants.RESOURCE_ENERGY) > 0){
    //     myCreeps.forEach(creep => {
    //         if(creep.store.getUsedCapacity() > 0){
    //             if(creep.transfer(tower, constants.RESOURCE_ENERGY) == constants.ERR_NOT_IN_RANGE){
    //                 creep.moveTo(tower);
    //             }
    //         }
    //         else{
    //             if(creep.withdraw(container, constants.RESOURCE_ENERGY) == constants.ERR_NOT_IN_RANGE){
    //                 creep.moveTo(container);
    //             }
    //         }
    //     })
    // }
    // tower.attack(enemyCreeps[0])
}
