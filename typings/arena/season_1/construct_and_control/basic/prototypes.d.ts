declare module 'arena/season_1/construct_and_control/basic/prototypes' {
  import { GameObject } from 'game/prototypes';
  import { EFFECT_SLOWDOWN } from 'arena/season_1/construct_and_control/basic/constants';

  type AreaEffectType = typeof EFFECT_SLOWDOWN;

  /** An object that applies an effect of the specified type to all creeps at the same tile */
  export class AreaEffect extends GameObject {
    /** The effect type */
    readonly effect: AreaEffectType;
  }
}

declare module 'arena/season_1/construct_and_control/basic/prototypes' {
  import { GameObject } from 'game/prototypes';

  /** An object that provides a construction boost effect to the creep that steps onto this object for 200 ticks */
  export class ConstructionBoost extends GameObject {
    /** The number of ticks until this object disappears */
    ticksToDecay: number;
  }
}

declare module 'arena/season_1/construct_and_control/basic/prototypes' {
  import { GameObject } from 'game/prototypes';

  /* A structure that needs to be built to win the match. */
  export class StructureGoal extends GameObject {}
}
