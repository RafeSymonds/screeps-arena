# Modifier effects

Pain and Gain uses [Effect](Effect.md) objects to modify creep actions. See [Effect](Effect.md) for the available effect types and their behavior.

Each ScoreFlag exposes one `effectType`. When a player controls multiple flags of the same type, the arena combines them into one effect using the arena's stacking formula rather than applying one effect per flag.

- **Effect** — One flag — Two flags
- **`EFF_ATTACK_MODIFIER`** — `0.8` — `0.6`
- **`EFF_RANGED_ATTACK_MODIFIER`** — `0.8` — `0.6`
- **`EFF_HEAL_MODIFIER`** — `0.75` — `0.5`
- **`EFF_DAMAGE_TAKEN_MODIFIER`** — `1.1` —
- **`EFF_FATIGUE_MODIFIER` (Advanced)** — `2` — `4`
- **`EFF_HITS_LOSS` (Advanced)** — `-1` — `-2`

Action and fatigue modifiers use `multiplier`. The `EFF_HITS_LOSS` effect uses a negative `offset` once per tick. Healing in the same tick can partially or fully offset this hits loss.
