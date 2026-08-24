declare module 'arena/season_2/capture_the_flag/advanced/prototypes' {
  import { BodyPartType, GameObject } from 'game/prototypes';

  /** A separate part of creep body */
  export class BodyPart extends GameObject {
    /** The type of the body part */
    type: BodyPartType;

    /** The number of ticks until this object disappears */
    ticksToDecay: number;
  }
}
