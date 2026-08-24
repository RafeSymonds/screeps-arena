# screeps-arena

Screeps Arena bots written in TypeScript, built with Rollup, deployed straight
into the game client's script folders.

## Layout

```
src/lib/                       shared code (world cache, body builders)
src/arenas/<arena-name>/       one bot per arena; main.ts must export loop()
typings/game/                  official typings, vendored from the installed client
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
bin/arena sync-typings      # refresh typings/ from the installed client
bin/arena logs              # tail the watcher
```

## How the build works

Each `src/arenas/<name>/main.ts` bundles to a single `dist/<name>/main.mjs`.
`game/*` and `arena/*` imports are marked external so they stay as the bare
specifiers the sandbox resolves. The build then copies the bundle to
`~/ScreepsArena/<name>/main.mjs`. Override that root with `ARENA_GAME_DIR`.

If a build warns that a client folder is missing, open that arena in Screeps
Arena once — the client creates the folder — then rebuild.

## Typings

Types come from the game client itself (`<client folder>/typings/game`), which
auto-updates with the game, rather than from a third-party types package. They
are vendored into `typings/` and checked in so builds don't depend on the
install. `bin/arena sync-typings` refreshes them.

The shipped typings (v1.2.0) have a bug: a stray top-level import in
`prototypes/game-object.d.ts` turns that file into a module, which silently
breaks every `extends GameObject` inheritance (no `id`, `moveTo`,
`findClosestByPath`, …). `sync-typings` strips that line automatically.
`skipLibCheck` covers the remaining authoring errors in the declarations.

## The included bot

`src/arenas/season3-spawn_strike` is a working baseline, not a strong bot: two
haulers keep the spawn fed from containers, everything else goes to melee
attackers that hold near the spawn until there are four of them, then commit to
the enemy spawn. Defense preempts the push. Treat it as a starting point.
