# Match review

Reads finished matches out of the game client's HTTP cache: the game record, the
replay frames, and the console output your own bot printed.

```sh
bin/arena games              # what is cached
bin/arena review <id>        # one match in detail (or `latest`, or `loss`)
bin/arena review loss --step 10
```

## Getting a specific match in front of it

The cache only holds what the client actually downloaded, so:

1. Open the match in Screeps Arena and **scrub its replay through to the end** —
   replays arrive in ~100-tick chunks, and only the chunks you watched are saved.
2. Run `bin/arena games`. A match listed with `0 frames` was never opened.

The cache is a cache: it evicts. Anything worth keeping should be reviewed, or
turned into a simulator fixture, before it ages out.

## Reading the output

`review` prints three things.

**Your bot's console output**, tick by tick — `recon.ts` dumps the opening
position on tick 1 and a progress line every 100 ticks, which is usually enough
to see where a match turned.

**A timeline**: spawn hit points, live damage and healing per side, and every
creep's size and position. Watch for damage that stops climbing (the army got
somewhere and then stopped), and for your creeps drifting away from the enemy
spawn (they were pulled onto something else).

**The opponent's biggest creep**, with its cost. Worth copying: this arena has a
fixed energy budget, so what they spent it on is their whole strategy.

## Two things the game record will mislead you about

`result.winner` is **your score**, not a player index — `1` you won, `0` you
lost, `0.5` a draw. Confirmed against rating movement: a `0` sits next to
`1086 -> 801`.

`usersCode` order and `firstPlayerIndex` do **not** line up with the
`player1`/`player2` in the replay frames. To know which side you were, read it
out of your own log — `recon.ts` prints `spawn mine (x,y)` on tick 1, and that is
unambiguous. `sideFromLog()` does this.

## Feeding a match back into the simulator

Two things are worth lifting out of a real match:

- **The opening position**, via `node tools/sim/extract-fixture.mjs`. It wants a
  genuine tick-0 frame: a later frame can be wound back for energy but not for
  ownership, and this arena starts with the flags and their rampart groups split
  one to a side rather than neutral.
- **The opponent**, as a new entry in `tools/sim/opponents.mjs`. `review` prints
  the bodies; the replay also shows when each was started. `deathball` and
  `kiter` were both reconstructed this way, and both reproduced real losses that
  every hand-written opponent had missed.
