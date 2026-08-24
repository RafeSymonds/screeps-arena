# screeps-arena

Screeps Arena bots written in TypeScript, built with Rollup, deployed straight
into the game client's script folders.

## Layout

```
src/lib/                       shared code (world cache, body builders)
src/arenas/<arena-name>/       one bot per arena; main.ts must export loop()
typings/                       official typings, vendored from the installed client
docs/api/                      API reference in markdown, generated from the client
tools/                         the generators behind `bin/arena sync`
dist/<arena-name>/main.mjs     build output (gitignored)
```

Arena folder names must match the client's folder names exactly (e.g.
`season3-spawn_strike`) — that's how a build knows where to deploy.

## Workflow

```bash
bin/arena start        # watch src/, rebuild + deploy on every save
bin/arena status       # watcher state, per-arena build/deploy status
bin/arena stop
bin/arena restart      # stop + clean rebuild + start
```

With the watcher running, save a `.ts` file and the client picks up the new
`main.mjs` on its next reload — no copying by hand.

One-shot commands:

```bash
bin/arena build [filter]    # build all arenas, or those matching a substring
bin/arena deploy [filter]   # copy built bundles into the client folder
bin/arena check             # tsc --noEmit
bin/arena new <arena-name>  # scaffold a new arena
bin/arena sync              # refresh typings/ and docs/ from the installed client
bin/arena logs              # tail the watcher
```

## How the build works

Each `src/arenas/<name>/main.ts` bundles to a single `dist/<name>/main.mjs`.
`game/*` and `arena/*` imports are marked external so they stay as the bare
specifiers the sandbox resolves. The build then copies the bundle to
`game/<name>/main.mjs`. Override that root with `ARENA_GAME_DIR`.

If a build warns that a client folder is missing, open that arena in Screeps
Arena once — the client creates the folder — then rebuild.

## Docs

`docs/api/` is the full Screeps Arena API reference in markdown — one file per
entity, indexed by `docs/api/index.md`. It is generated from the docs page that
ships inside the game client (identical to the online copy at
<https://arena.screeps.com/docs/>, but guaranteed to match the installed
version). Regenerate with `bin/arena sync-docs`; never edit it by hand.

Use it rather than `docs.screeps.com` — that documents Screeps World, whose API
differs from Arena's in ways that still compile.

## Typings

Types come from the game client itself rather than a third-party types package,
so they auto-update with the game. They are vendored into `typings/` and checked
in so builds don't depend on the install:

- `typings/game/` — the core API, copied from the client's per-arena typings.
- `typings/arena/` — the arena-specific modules (`BonusFlag`, `EscortCreep`,
  portals, score collectors, …) for every season, assembled from the client's
  `arena-definitions`. Several files declare the same ambient module, so the
  sync merges them.

`bin/arena sync-typings` refreshes both.

The shipped typings (v1.2.0) have a bug: a stray top-level import in
`prototypes/game-object.d.ts` turns that file into a module, which silently
breaks every `extends GameObject` inheritance (no `id`, `moveTo`,
`findClosestByPath`, …). `sync-typings` strips that line automatically.
`skipLibCheck` covers the remaining authoring errors in the declarations.

## The included bot

`src/arenas/season3-spawn_strike` is a first pass, not a strong bot. It spends
everything on melee attackers, masses four of them near the spawn, then commits
to the enemy spawn; enemies near our own spawn preempt the push.

It assumes nothing about the map. What a Spawn Strike arena actually contains is
generated server-side and appears in neither the docs nor the client bundle, so
`recon.ts` prints a full inventory — every object type, counts by owner, spawn
and source positions, the map extent, tick and CPU limits — to the client
console on tick 1, plus a progress line every 50 ticks. Run one match, read the
console, then tune against facts.

Note the objective is to destroy the enemy spawn. The blurb the client shows for
Spawn Strike ("capture your opponent's flag") is a copy-paste of the Capture the
Flag description and is wrong.
