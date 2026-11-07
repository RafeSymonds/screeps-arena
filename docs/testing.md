# Testing and analysing the bot

Three levels of evidence, cheapest first. Each catches things the one before
cannot.

| level       | command              | runs where                | proves                                         |
| ----------- | -------------------- | ------------------------- | ---------------------------------------------- |
| compiles    | `bin/arena check`    | offline                   | the code typechecks                            |
| simulated   | `bin/arena sim`      | offline, our engine model | no crashes, coherent behaviour under our rules |
| real, free  | `bin/arena test`     | arena server, unrated     | how it plays real opponents' code              |
| real, rated | `bin/arena play [n]` | arena server, ranked      | the same, against whoever matchmaking picks    |

The simulator shares our misreadings of the rules by construction (see
`tools/sim/README.md`). Only `test` and `play` run the real engine, and only
they can say a change works.

## One-time setup (per machine)

1. Install Steam and Screeps Arena, sign in to Steam.
2. In Steam: Screeps Arena → Properties → General → Launch Options:
   `--remote-debugging-port=9222`
3. Start the game from Steam (or `bin/arena client launch`) and wait for the
   arena list.
4. `bin/arena client` should print `client connected, API reachable`.
5. `bin/arena client link` points the client's script folder for each unlocked
   arena at `<repo>/game/<arena>`, then `bin/arena build` deploys into them.
   After this, pressing Play in the client plays the repo's build. Restart the
   client if its Play screen still shows the old folder (the default is
   `~/ScreepsArena/<arena>`).

Steam runs one game per account. Starting the client on this machine while you
are playing elsewhere makes Steam ask to end the other session, so run real
matches here only when you are not playing.

## The loop

```sh
bin/arena check                 # compiles
bin/arena sim                   # offline sweep (if the arena has a sim model)
bin/arena test                  # real, unrated, vs every saved test opponent
bin/arena play 3                # real, rated: 3 games through matchmaking
bin/arena games                 # what's archived
bin/arena review latest         # one game: bot log, timeline, enemy bodies
```

`test` and `play` build first and upload `dist/<arena>/main.mjs` directly, so
they do not depend on the client's script folder. Both default to
`season4-pain_and_gain`; pass `--arena <folder>` for another arena. Each game
takes about four minutes (rated games add matchmaking time) and runs one at a
time.

### Test opponents

`bin/arena test --list` shows them. They come in three lists:

- `system`: the arena's built-in bot. In Pain and Gain it never moves, so
  beating it proves only that the bot runs.
- `recent`: the code of opponents from your recent rated games. Every `play`
  adds one, so rated games are how the test suite grows.
- `favorites`: opponents saved permanently with Test Tokens (a Steam inventory
  item), from the Tests screen in the client.

`--opponent <name>` filters by name and `--repeat <n>` plays each one n times.

### Rated games

`bin/arena play [n]` moves the account's rating. Use `test` for iteration and
`play` when a change looks good or when the test suite needs new opponents.

## Analysing games

Every `test` and `play` game is archived automatically. `bin/arena fetch`
archives recent games played any other way, including by hand in the client:

```sh
bin/arena fetch                       # every unlocked current-season arena
bin/arena fetch --arena spawn_strike  # by folder-name substring, any season
bin/arena fetch <game-id>             # one game
```

The server lists only the last five games per arena, so fetch after each
session if you want a complete history.

Archived games live in `matches/<game-id>.json.gz` (gitignored): the game
record, every replay frame (every object's position, hits and owner per tick),
and the bot's console output. `bin/arena review <id|latest|loss>` reads them,
and so do the simulator's ghost opponents and fixture extractor. Test games
carry a `test` field naming the opponent, rated ones `rated: true`.

The bot's own logging is the cheapest analysis there is: what it prints shows
up in `review` per tick, so print the state you will want to read afterwards.

## Paths

| what                  | default                                                        | override            |
| --------------------- | -------------------------------------------------------------- | ------------------- |
| client script folders | `<repo>/game/<arena>`                                          | `ARENA_GAME_DIR`    |
| match archive         | `<repo>/matches`                                               | `ARENA_ARCHIVE_DIR` |
| client debug port     | `9222`                                                         | `ARENA_DEBUG_PORT`  |
| client HTTP cache     | `~/Library/Application Support/screeps_arena/Cache/Cache_Data` | `ARENA_CACHE_DIR`   |
| installed client      | Steam's `steamapps/common/ScreepsArena`                        | `ARENA_APP_DIR`     |

## Troubleshooting

- **`No client listening on debug port 9222`**: the client is not running, or
  was started without the launch option. Launching the app binary directly
  does not work: it relaunches through Steam and drops the argument.
- **`401` from the API**: the client is open but not signed in. Wait for the
  arena list to load.
- **A game shows `0 frames` in `games`**: it is only in the client's HTTP
  cache. `bin/arena fetch <id>` gets all of it.
- **The client plays an old build when you press Play**: run
  `bin/arena client link` and `bin/arena build`, then restart the client.

How the client bridge works, and what was confirmed against the live client,
is in `tools/client/README.md`.
