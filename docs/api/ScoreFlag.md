# ScoreFlag

`class extends Flag`

Import from `arena/season_4/pain_and_gain/basic`.

A flag that scores points for its owner at the cost of a global effect.

### effectType

**Type:** `string`

The global effect applied while this flag is controlled. The value is one of `EFF_ATTACK_MODIFIER`, `EFF_RANGED_ATTACK_MODIFIER`, `EFF_HEAL_MODIFIER`, or `EFF_DAMAGE_TAKEN_MODIFIER`. Advanced also supports `EFF_FATIGUE_MODIFIER` and `EFF_HITS_LOSS`.

### scorePerTick

**Type:** `number`

The score awarded to the owner each tick.
