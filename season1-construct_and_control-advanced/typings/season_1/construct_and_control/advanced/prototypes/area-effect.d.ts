declare module "arena/season_1/construct_and_control/advanced/prototypes" {
    import { GameObject } from "game/prototypes";
    import { EFFECT_SLOWDOWN, KIND_RED, KIND_BLUE, KIND_GREEN } from "arena/season_1/construct_and_control/advanced/constants";

    type AreaEffectType =
        typeof EFFECT_SLOWDOWN;

    type EffectKind = 
        typeof KIND_RED |
        typeof KIND_BLUE |
        typeof KIND_GREEN;

    /** An object that applies an effect of the specified type to all creeps at the same tile */
    export class AreaEffect extends GameObject {
        /** The effect type */
        readonly effect: AreaEffectType;

        /** The kind of this effect */
        readonly kind: EffectKind;
    }
}
