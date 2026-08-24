// Prototype identities the bot's getObjectsByPrototype() calls are matched on.
export class GameObject {}
export class Structure extends GameObject {}
export class OwnedStructure extends Structure {}
export class Creep extends GameObject {}
export class StructureSpawn extends OwnedStructure {}
export class StructureExtension extends OwnedStructure {}
export class StructureRampart extends OwnedStructure {}
export class StructureWall extends Structure {}
export class StructureTower extends OwnedStructure {}
export class StructureContainer extends Structure {}
export class StructureRoad extends Structure {}
export class ConstructionSite extends GameObject {}
export class Source extends GameObject {}
export class Resource extends GameObject {}
export class Flag extends GameObject {}
