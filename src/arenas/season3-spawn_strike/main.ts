import { travelMatrix } from '../../lib/matrix';
import { pruneTrips } from '../../lib/movement';
import { world } from '../../lib/world';
import { makePlan } from './plan';
import { produce, pruneRoles, roleOf } from './production';
import { reportArena, reportProgress } from './recon';
import { pruneTactics, runHunter, runRunners, runSquad } from './tactics';

/**
 * Season 3 Spawn Strike (basic). Destroy the enemy spawn; a 2000-tick timeout
 * is a draw.
 *
 * The board is a 100x100 mirror. Each side has a spawn behind a bank of 80
 * extensions and there are no sources, so the ~9000 energy sitting there at tick
 * 1 plus the spawn's +1/tick trickle is the entire match budget — there is no
 * economy to play, only a build order. Between the bases sits a walled keep with
 * two flags in it, controlling a cross of ramparts that runs the length of the
 * map, and a pair of heavily walled shortcuts down the flanks (30k hits each in
 * a replay of a real match — this arena overrides `WALL_HITS`).
 *
 * What actually wins:
 *
 * - **Melee.** ATTACK does 30 damage for 80 energy against RANGED_ATTACK's 10
 *   for 150, and the target that matters is a 3000-hit building that cannot
 *   move. A handful of ATTACK parts in contact ends the match in a few ticks.
 * - **The flags, cheaply.** Standing on one hands you its rampart group, and a
 *   creep on a rampart it owns cannot be damaged at all — attacks land on the
 *   10k-hit rampart instead. Two 50-energy MOVE creeps buy that, and deny it.
 *   The rampart cross is *not* the highway it looks like, though: the terrain
 *   between our base and the near end of it is a maze, and routing an army that
 *   way is half again as far as heading straight at the enemy.
 * - **Their extensions.** They are 100 hits each and hold energy the enemy has
 *   not spent yet, so a fast raider parked in their bank is worth far more than
 *   its 990 energy.
 * - **Not losing the race.** Both sides are ~200 ticks apart and both have the
 *   same budget, so the match is decided by who lands a killing blow first.
 *   Every tick we work out when each spawn would fall if nobody changed course
 *   and hold back exactly enough to survive — see `orderSquad` in tactics.ts.
 */

/** Print a progress line this often. */
const REPORT_EVERY = 100;

let announced = false;

export function loop(): void {
  const w = world();

  if (!announced) {
    reportArena();
    announced = true;
  }

  const plan = makePlan(w);
  if (!plan) return;

  produce(w);

  pruneRoles(w.myCreepIds);
  pruneTrips(w.myCreepIds);
  pruneTactics(w.myCreepIds);

  // Our ramparts cost less than open ground, so army paths hug the covered
  // corridor.
  const army = travelMatrix(w, { rampartCost: 1 });

  runRunners(w, plan, army);
  // The raider wants a second matrix that also steers wide of anything armed.
  // That is a full extra pass over every object on the map, so it is only worth
  // building while a raider is actually alive.
  if (w.myCreeps.some(c => roleOf(c) === 'hunter')) {
    runHunter(w, plan, travelMatrix(w, { rampartCost: 1, dangerCost: 12, dangerRange: 5 }));
  }
  runSquad(w, plan, army);

  if (w.tick % REPORT_EVERY === 0) reportProgress(w);
}
