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
 * The map is a 100x100 mirror: both spawns sit behind their own bank of 80
 * extensions, and there are no sources — the ~9000 energy on the board at tick 1
 * plus the spawn's +1/tick trickle is the entire match budget. Between the two
 * bases stands a cross of ramparts running the length of the map, controlled by
 * two flags in the walled keep at the centre.
 *
 * Those ramparts are the whole arena. A creep standing on a rampart it owns
 * cannot be damaged — attacks land on the 10k-hit rampart instead — and enemy
 * creeps cannot step on it at all. Whoever puts a creep on the flags first gets
 * a covered highway down the middle of the map and locks the opponent out of
 * the keep, since the ring can then only be entered by chewing through 10k hits.
 *
 * So the plan is: win the flag race with two 50-energy MOVE creeps, spend the
 * rest of the board on a melee army with medic support, muster it on the
 * ramparts where it cannot be shot, and walk it into the enemy spawn.
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
