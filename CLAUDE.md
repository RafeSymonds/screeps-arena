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
| `bin/arena check`                                | `tsc --noEmit`                                              |
| `bin/arena sim [options]`                        | play the built bundle against scripted opponents offline    |
| `bin/arena fetch [ids]`                          | archive real matches from the arena API (needs client open) |
| `bin/arena test [--arena a] [--repeat n]`        | real unrated test matches vs saved opponents (client open)  |
| `bin/arena games` / `review <id>`                | list and inspect archived or cached matches                 |
| `bin/arena new <arena-name>`                     | scaffold `src/arenas/<arena-name>/main.ts`                  |
| `bin/arena sync`                                 | refresh vendored typings and docs from the installed client |

**Neither gate proves a bot works.** `bin/arena check` proves the code compiles.
`bin/arena sim` plays it against scripted opponents inside a model of the engine
written from these docs — good at catching runtime faults and incoherent
behaviour, useless for discovering that a rule was misread, because the model and
the bot share the same misconceptions. The opponents are scripts, and the
fixture holds one sample of terrain that the real arena regenerates every match.

Behaviour against a real opponent is only verified by a real match. `bin/arena
test` plays one on the real server in unrated test mode, but needs the client
running on this machine with its debug port (see `tools/client/README.md`), and
the opponents are limited to what the account has saved. Never claim a bot change "works" on the strength
of a green build or a clean sim sweep — say what was checked and that gameplay is
unverified. See `tools/sim/README.md`.

## Layout

```
src/lib/                  shared code, imported by arenas via relative paths
src/arenas/<name>/main.ts one bot per arena; must export loop()
typings/game/, arena/     GENERATED — vendored from the client, never hand-edit
typings/sandbox.d.ts      HAND-WRITTEN — sandbox globals the client's typings omit
docs/api/                 GENERATED — markdown API reference, never hand-edit
dist/                     GENERATED — build output (gitignored)
game/<name>/              what the client reads; contents gitignored
tools/                    the generators behind `bin/arena sync`
tools/sim/                offline simulator behind `bin/arena sim`
tools/client/             talks to the arena API through the running client
matches/                  match archive written by `bin/arena fetch` (gitignored)
```

`src/arenas/<name>` must match the client's folder name under `game/`
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

`season3-spawn_strike` — objective is to **destroy the enemy spawn**. The blurb
on the arena tile in the client ("capture your opponent's flag") is a copy-paste
of the Capture the Flag text and is wrong; the real description lives on the
server (see _Recovering arena facts_ below).

What the arena actually contains, confirmed from a real match:

- 100x100 map, structures mirrored under a 180° rotation, terrain **randomised
  per match** — do not hardcode routes, path everything at runtime.
- Per side: one spawn (3000 hits, 1000 energy) behind a bank of **80 extensions**
  (100 energy each), all within `SPAWN_RANGE` of the spawn. No sources, no
  towers, no containers, and construction is disabled. That is ~9000 energy for
  the whole match, plus the spawn's **+1 energy/tick** regeneration — the arena
  text says energy does not regenerate, but the spawn's own trickle still does.
- A walled keep at the centre holding two `Flag`s. Standing on a flag transfers
  its rampart group (152 ramparts total, 10k hits each) to you: a cross running
  the length of the map plus the keep's own ring. Own ramparts are walkable by
  you, block the enemy, and shield anything standing on them. Ramparts expose
  `controlledBy` (the `Flag`), which the shipped typings omit.
- 20 `StructureWall`s sealing a diagonal shortcut on each flank — the "secret
  passage". A cached replay shows them at `hits: 30000`, i.e. this arena
  overrides the `WALL_HITS` constant of 10000, so breaching one costs 60k damage
  for a two-tile gap. It roughly halves the trip between the bases, and helps the
  opponent exactly as much as it helps us.

`recon.ts` still prints a full inventory on tick 1; read the client console after
a match rather than trusting the above if anything looks off.

`season4-pain_and_gain` — score more than the opponent by tick 2000, or wipe out
their army. Rules from the server's arena description; layout confirmed from
real game 6aef6316c816bdd1c0647158 (unrated test vs System):

- 14 pre-set creeps a side, mirrored: 2 scouts (1 MOVE), 4 melee (8 ATTACK +
  8 MOVE), 5 ranged (6 RANGED_ATTACK + 6 MOVE), 3 healers (6 HEAL + 6 MOVE).
  Weapons come first in every body, so a creep below about half its hits has
  no weapon left. Player 1 starts top-left, player 2 bottom-right.
- No spawning, energy, construction or replacements.
- Seven neutral `ScoreFlag`s (`arena/season_4/pain_and_gain/basic`), captured by
  standing on one. Each scores `scorePerTick` for its owner and debuffs the
  owner's whole army. Vulnerability at (49,49): 5/tick, damage taken ×1.1. Heal
  at (90,8) and (8,90): 4/tick, ×0.75 then ×0.5. Attack at (67,31) and (31,67):
  3/tick, ×0.8 then ×0.6. Ranged at (13,49) and (85,49): 3/tick, ×0.8 then ×0.6.
  Same-type flags combine by table, not by multiplying.
- Terrain is randomised per match (it differs from the arena's preview image).
- The match ends early when an army is gone or a lead can no longer be caught.
- The sandbox exposes no score; the bot counts it from flag ownership. Flags
  read `my === undefined` until someone captures them.
- `bin/arena sim --arena season4-pain_and_gain` plays it offline
  (`tools/sim/pain-and-gain.mjs`), including against the bot itself.
- In test mode the only opponent offered is System, which does nothing.

## Recovering arena facts

The arena's contents are generated server-side and are not in the client bundle,
but the client's Chromium HTTP cache keeps what it fetched, including the real
arena description and **whole replays** (every object's type, position, owner and
hits, per tick, plus the terrain string):

```
~/Library/Application Support/screeps_arena/Cache/Cache_Data/
```

Entries are `<hash>_0` files: the request URL is in the first few hundred bytes
as plain text, and the body is gzip from the first `1f 8b`. Useful ones are
`/api/arena/<id>` (description), `/api/game/<id>` (terrain + result) and
`/api/game/<id>/replay/<tick>`. Terrain is indexed `terrain[y * 100 + x]` with
`0` plain, `1` wall, `2` swamp.

## The vendored typings are patched

`typings/game` comes from the installed client, and the shipped v1.2.0 typings
have a bug: a stray top-level import in `prototypes/game-object.d.ts` turns the
file into a module, which silently breaks every `extends GameObject`
inheritance — `id`, `moveTo`, and `findClosestByPath` all disappear from every
prototype. `bin/arena sync-typings` strips that line on every sync. If those
members ever go missing again, that's the cause. `skipLibCheck` is on to absorb
the remaining authoring errors in the declarations, so don't turn it off.
