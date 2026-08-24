declare module 'arena/season_beta/collect_and_control/basic/prototypes' {
  import { GameObject } from 'game/prototypes';
  import {
    EFFECT_FREEZE,
    EFFECT_DAMAGE,
    EFFECT_HEAL,
  } from 'arena/season_beta/collect_and_control/basic/constants';

  type AreaEffectType = typeof EFFECT_FREEZE | typeof EFFECT_DAMAGE | typeof EFFECT_HEAL;

  /** An object that applies an effect of the specified type to all creeps at the same time */
  export class AreaEffect extends GameObject {
    /** The effect type */
    readonly effect: AreaEffectType;
  }
}

declare module 'arena/season_beta/collect_and_control/basic/prototypes' {
  import { GameObject, ResourceType } from 'game/prototypes';

  /** Key game object for this arena. Transfer the corresponding resource to the collector to win the game */
  export class ScoreCollector extends GameObject {
    /** Whether you have control over this collector */
    my?: boolean;

    /**The type of the resource this collector accepts */
    resourceType: ResourceType;

    /** Current collected score number of the owner */
    score: number;

    /** Total number of score needed to win instantly */
    scoreTotal: number;
  }
}
