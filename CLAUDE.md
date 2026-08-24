# screeps-arena

TypeScript bots for [Screeps Arena](https://store.steampowered.com/app/1137320/Screeps_Arena/).
One bundle per arena, built by Rollup and copied into the game client's script
folder so a save in watch mode lands in the running game.

## Commands

Everything goes through `bin/arena` — don't call rollup/tsc directly.

| command                                          | what it does                                                |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `bin/arena start [--build]`                      | watch `src/`, rebuild + deploy on save                      |
| `bin/arena stop` / `restart` / `status` / `logs` | watcher lifecycle                                           |
| `bin/arena build [filter]`                       | one-shot build (filter is a substring of the arena name)    |
| `bin/arena deploy [filter]`                      | copy built bundles to the client without rebuilding         |
| `bin/arena check`                                | `tsc --noEmit` — the only correctness gate in this repo     |
| `bin/arena new <arena-name>`                     | scaffold `src/arenas/<arena-name>/main.ts`                  |
| `bin/arena sync`                                 | refresh vendored typings and docs from the installed client |

**There is no test suite and no simulator harness.** `bin/arena check` proves the
code compiles, nothing more. Behaviour is only verified by running a match in
the client, which a human has to do. Never claim a bot change "works" on the
strength of a green build — say it compiles and deploys, and that gameplay is
unverified.

## Layout

```
src/lib/                  shared code, imported by arenas via relative paths
src/arenas/<name>/main.ts one bot per arena; must export loop()
typings/game/, arena/     GENERATED — vendored from the client, never hand-edit
typings/sandbox.d.ts      HAND-WRITTEN — sandbox globals the client's typings omit
docs/api/                 GENERATED — markdown API reference, never hand-edit
dist/                     GENERATED — build output (gitignored)
tools/                    the generators behind `bin/arena sync`
```

`src/arenas/<name>` must match the client's folder name under `~/ScreepsArena`
exactly (e.g. `season3-spawn_strike`) — that mapping is how deploy finds its
target. If the client folder doesn't exist yet, the arena has to be opened in
the game once to create it.

## API reference

`docs/api/index.md` indexes everything; one file per entity, e.g.
`docs/api/Creep.md`, `docs/api/Constants.md`, `docs/api/getObjectsByPrototype.md`.
**Read these instead of guessing at the API or reaching for Screeps World
knowledge** — Arena's API differs from `docs.screeps.com` in ways that look
subtle and compile fine. They are rendered from the docs page shipped inside the
game client, so they match the installed version.

## Game API notes

- Imports are bare specifiers the sandbox resolves: `game`, `game/utils`,
  `game/prototypes`, `game/constants`, `game/path-finder`, `game/visual`, and
  per-arena `arena/<season>/<arena>/<mode>` modules. Rollup marks them external;
  they must never be bundled or rewritten to relative paths.
- `getObjectsByPrototype` walks the whole object list. Call it once per tick via
  `world()` in `src/lib/world.ts`, not from creep logic.
- `store.getUsedCapacity()` / `getFreeCapacity()` return `number | null`. Use the
  `energyIn` / `freeSpaceIn` helpers rather than sprinkling `?? 0`.
- Module-level state persists across ticks within a match (the sandbox loads
  `main.mjs` once and calls `loop()` each tick). Nothing persists between
  matches. Keyed state must be pruned as creeps die or it grows all match.
- Several creep actions are mutually exclusive within one tick — `harvest`,
  `build`, `attack`, `heal`, `rangedHeal`, `rangedAttack`, `rangedMassAttack`
  have documented conflicts. Check the method's page in `docs/api/Creep.md`
  before issuing two in the same tick.
- CPU is wall-clock limited per tick: `arenaInfo.cpuTimeLimit` (nanoseconds,
  with a separate `cpuTimeLimitFirstTick`), measured with `getCpuTime()`.
- `GameObject.id` is `number | string`, not just `string`.
- `console.log` and `arenaInfo` work at runtime but are missing from the shipped
  typings (`arenaInfo` is in the docs, just not the `.d.ts`). They are declared
  in `typings/sandbox.d.ts`, which is hand-written and survives `bin/arena sync`.
  Anything else the sandbox provides but the typings omit belongs there too.

## Conventions

- Strict TypeScript with `verbatimModuleSyntax`: type-only imports need
  `import type`.
- Relative imports between `src/` files; no path aliases are configured.
- Named exports only.
- Shared logic goes in `src/lib/`. An arena folder holds only that arena's
  strategy.

## Arenas

`season3-spawn_strike` — objective is to **destroy the enemy spawn**. The
description shown in the game client ("capture your opponent's flag") is a
copy-paste of the Capture the Flag blurb; it is identical across seasons 1 and 3
and is wrong. The arena's real contents are generated server-side and are not in
the client bundle, so `recon.ts` prints a full inventory on tick 1 — read the
client console after a match rather than guessing at the map.

## The vendored typings are patched

`typings/game` comes from the installed client, and the shipped v1.2.0 typings
have a bug: a stray top-level import in `prototypes/game-object.d.ts` turns the
file into a module, which silently breaks every `extends GameObject`
inheritance — `id`, `moveTo`, and `findClosestByPath` all disappear from every
prototype. `bin/arena sync-typings` strips that line on every sync. If those
members ever go missing again, that's the cause. `skipLibCheck` is on to absorb
the remaining authoring errors in the declarations, so don't turn it off.
