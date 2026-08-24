# Offline simulator

Plays a built arena bundle against scripted opponents on a real arena's starting
position, so a change can be exercised before anyone opens the game.

```sh
bin/arena sim                                   # every opponent, both sides
bin/arena sim --opponent rusher --side 2        # one match
bin/arena sim --opponent blob --side 1 --trace  # positions and flag captures
```

It builds first, so it always runs the current source, and exits non-zero if any
match is not won — usable as a gate on a change.

## What this is worth

**A clean sweep is evidence that the bot behaves. It is not proof that it wins.**
The engine here is a model written from the API docs, and the opponents are a few
hundred lines of script. Both share the author's misconceptions by construction,
so the simulator cannot discover that a rule was misread — only that the bot does
something coherent under the rules as understood.

What it is genuinely good at is the class of fault a typecheck cannot see. It has
already caught, in this repo:

- a body laid out `MOVE MOVE MOVE ATTACK ATTACK` losing every MOVE part before
  the first ATTACK part, stranding a 30-part creep at fatigue 14 for the rest of
  the match;
- pathfinding with default swamp costs sending pure-MOVE creeps on 190-step
  detours around swamp that costs them nothing;
- an army oscillating across the middle of the map for 200 ticks because two
  competing objectives kept swapping;
- the assumption that the central rampart cross is a shortcut — measured, it is
  half again as long as going straight at the enemy.

Behaviour against a real opponent still has to be watched in the client.

## Layout

| file                  | what it is                                                     |
| --------------------- | -------------------------------------------------------------- |
| `run.mjs`             | CLI: loads the bundle, plays the matches, prints the table     |
| `engine.mjs`          | the world model and tick resolution                            |
| `opponents.mjs`       | the scripted opponents                                         |
| `hooks.mjs`           | ESM resolve hook mapping `game/*` onto the stubs               |
| `stubs/`              | stand-ins for the sandbox modules                              |
| `fixtures/`           | starting positions distilled from real matches                 |
| `gen-constants.mjs`   | regenerates `stubs/constants.mjs` from `docs/api/Constants.md` |
| `extract-fixture.mjs` | rebuilds a fixture from the game client's HTTP cache           |

The bundle is loaded straight out of `dist/` through the resolve hook, so the
simulator runs the same file the client does rather than a rewritten copy.

`stubs/constants.mjs` is **generated** — `bin/arena sim` regenerates it every run.
Hand-maintaining it went wrong once already: a missing `SPAWN_RANGE` made
`spawnCreep` ignore every extension, so neither side could afford a fighter and
every match came out identical.

## How far to trust an opponent

The opponents reconstructed from real matches are only as good as the guess at
how they were *played*. Their bodies come straight out of the replay and are
exact; their behaviour is a few lines of script and is not.

- `kiter` reproduces its real loss from both ends of the map. Findings against it
  have held up.
- `healball` and `swarmer` are beaten by this bot in simulation, and both beat it
  in the real match. Something about how they were played is missing, so a win
  against either proves nothing.

Check a new opponent reproduces its real result before tuning anything against
it. Two body rebalances have already been reverted for being validated against a
scripted opponent that was not reproducing the loss it came from.

## Fixtures

Arena contents are generated server-side and are in neither the client bundle nor
the docs, but the client's HTTP cache keeps whole replays. `extract-fixture.mjs`
reads one and winds it back to tick zero:

```sh
node tools/sim/extract-fixture.mjs
```

It needs a cached game _and_ its replay, so play a ranked match and open its
replay in the client first. Override the cache location with `ARENA_CACHE_DIR`.

Take care with what a mid-match frame implies. The committed fixture came from
tick 1001, when one player already held both flags and all 152 ramparts; copying
that ownership through handed one side the centre from tick one and made the
whole flag mechanic untestable. The extractor now resets ramparts and flags to
neutral and refills the energy that had been spent.

## What is modelled

Terrain and fatigue, eight-way movement, and blocking by terrain, walls,
structures, hostile ramparts and creeps. `spawnCreep` with energy drawn from the
spawn and every extension within `SPAWN_RANGE`, three ticks per part, the creep
visible while it spawns. `attack`, `rangedAttack`, `rangedMassAttack`, `heal` and
`rangedHeal`, with the same-tick conflicts the docs describe. Damage applied
through body parts front to back, and ramparts shielding whatever stands on them.
Flags handing their rampart group to whoever steps on them. The spawn's +1/tick
energy trickle. `CostMatrix` and an A* honouring `plainCost`, `swampCost`,
`heuristicWeight`, `flee` and `maxOps`.

## What is not

- **Intent ordering.** The real engine resolves a tick's intents together. Here
  attacks apply as they are called and moves resolve at end of tick, so mutual
  kills, contested tiles and move-into-vacated-tile all differ at the margin.
- **The pathfinder.** Same cost model, but plain JavaScript: it may return a
  different route among several of equal cost, and it is far slower than the
  native one. The `cpu` column measures this simulator, not the game's budget —
  use `paths/tick` as the real signal, since search count is what the game
  charges for.
- **Terrain.** The fixture holds one sample. The real arena generates terrain per
  match; only the structures are fixed. Never tune to this map.
- **Everything the economy arenas need** — `harvest`, `build`, `transfer`,
  `withdraw`, `pickup`, `drop`, `pull`, decay — is absent, because Spawn Strike
  has none of it. Add it before pointing this at another arena.
- **`arenaInfo`** is hardcoded to the values Spawn Strike reports.
