# Client bridge

Scripts that talk to the arena server (`https://arena.screeps.com/api`) as the
signed-in game client, so match data can be pulled without anyone clicking
through replays.

```sh
bin/arena client            # is the client reachable, and is the API answering?
bin/arena fetch             # archive recent games from every unlocked current-season arena
bin/arena fetch --arena spawn_strike
bin/arena fetch <game-id>   # one game
bin/arena games             # list everything archived or cached
bin/arena review latest
bin/arena test              # real unrated matches vs saved opponents (season4-pain_and_gain)
bin/arena test --arena season3-spawn_strike --repeat 3 --opponent System
bin/arena test --list       # just show the opponents
bin/arena play 3            # three RATED games through matchmaking (moves rating)
```

## Test mode

`test` builds the bundle, zips `dist/<arena>/main.mjs` the way the client zips
its script folder, and posts it to `/test/start` once per opponent per repeat.
Test games are played by the real server and do not touch rating. Each one is
polled until finished (pending, running, finished), archived to `matches/` with
a `test` field naming the opponent, and summarised at the end.

Opponents come from `/test/codes/<arenaId>` in three lists: `system` (the
arena's built-in bot), `recent` (opponents from your recent rated games) and
`favorites` (saved permanently with Test Tokens). A fresh arena has only the
System bot, which in Pain and Gain sits still, so a win against it proves
little. The list grows as you play rated games.

`play` posts to `/game/start` instead, the client's normal ranked button. It
moves the account's rating, and each opponent met becomes a `recent` test
opponent, which is the cheap way to grow the test suite.

Games run one at a time and take a few minutes each; the first Pain and Gain
test took about four.

## How it works

The server authenticates with a session cookie the client gets by trading a
Steam ticket at `/api/auth/login`. Only the native client can produce that
ticket, so these tools do not log in themselves. They attach to the running
client over the Chrome DevTools Protocol and run each request inside the
client's own page (`cdp.mjs`). Requests go out with the client's session, and
the scripts never see the cookie.

## One-time setup

In Steam: Screeps Arena → Properties → General → Launch Options:

```
--remote-debugging-port=9222
```

Then start the game from Steam as usual (or `bin/arena client launch`).
Launching the app binary directly does not work: the client relaunches itself
through Steam and drops the argument. Use `ARENA_DEBUG_PORT` for another port.

The port is bound to 127.0.0.1 only, but anything on the machine can drive the
signed-in client through it while it is open.

Steam allows one running game per account. Starting the client here while you
are playing on another machine will make Steam ask to end the other session, so
run these when you are not playing.

## The archive

`fetch` writes one gzipped JSON per game to `matches/` (gitignored,
`ARENA_ARCHIVE_DIR` to move it): `{ id, arenaId, fetchedAt, record, frames,
logs }`, the same shape the cache reader produces. `collectGames()` in
`tools/replay/cache.mjs` merges archive and cache, so `games`, `review`, ghost
opponents and `extract-fixture` all read archived games without changes.

Replays and logs come in the chunks the client itself requests: tick 0 alone,
then one chunk per 100 ticks named by its last tick (`/replay/100`,
`/replay/200`, ... `/replay/<final tick>`). Log chunks are objects keyed by
absolute tick. A 100-tick replay chunk of a full Spawn Strike match is ~6 MB,
too big to return through one DevTools call, so `cdp.mjs` transfers response
bodies in 512 KB slices.

## Confirmed against the live client (v1.0.14, 2026-11-07)

- The Electron build honours `--remote-debugging-port`; the main window's URL
  is `.../app/dist/#/<route>`.
- `/arena/<id>/last-games` returns `{ games: [...] }`, each item a rating
  record whose `game._id` is the game id (the item's own `_id` is not).
  It holds only the last handful of games per arena (5 in Season 3), so fetch
  regularly if you want a full history.
