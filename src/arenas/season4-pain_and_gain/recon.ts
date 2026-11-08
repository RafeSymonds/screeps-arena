import { arenaInfo } from 'game';
import type { Creep } from 'game/prototypes';
import type { FlagPlan } from './flags';
import type { Orders } from './army';
import type { State } from './state';

const at = (o: { x: number; y: number }) => `(${o.x},${o.y})`;

function bodyOf(c: Creep): string {
  const n: Record<string, number> = {};
  for (const p of c.body) n[p.type] = (n[p.type] ?? 0) + 1;
  return Object.entries(n)
    .map(([t, k]) => `${t}x${k}`)
    .join(' ');
}

/**
 * The armies and the flag layout come from the server, not the client, so the
 * first tick prints both. Read the client console after a match to check the
 * bot's picture of the arena against what is really there.
 */
export function reportArena(s: State): void {
  console.log(
    `=== ${arenaInfo.name} | ${arenaInfo.season} | level ${arenaInfo.level} | ` +
      `ticks ${arenaInfo.ticksLimit} | cpu ${arenaInfo.cpuTimeLimit / 1e6}ms`,
  );
  for (const f of s.flags) {
    console.log(`flag ${f.id} ${at(f)} ${f.effectType} +${f.scorePerTick}/t my=${f.my}`);
  }
  for (const c of s.myCreeps) console.log(`mine ${c.id} ${at(c)} ${bodyOf(c)} hits=${c.hits}`);
  for (const c of s.enemyCreeps) console.log(`enemy ${c.id} ${at(c)} ${bodyOf(c)} hits=${c.hits}`);
}

export function reportProgress(s: State, plan: FlagPlan, o: Orders, split = false): void {
  console.log(
    `t${s.tick} score ${s.myScore}-${s.enemyScore} (+${s.myRate}/+${s.enemyRate}) ` +
      `creeps ${s.myCreeps.length}v${s.enemyCreeps.length} ratio ${plan.ratio.toFixed(2)} ` +
      `want ${plan.wanted.size} margin ${Math.round(plan.margin)} ${split ? 'split ' : ''}mode ${o.mode}` +
      (o.target ? ` -> ${at(o.target)}` : ''),
  );
}
