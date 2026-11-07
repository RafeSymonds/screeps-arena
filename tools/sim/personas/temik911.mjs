// temik911 (code seen from 2026-11-07 18:40), from 145 replays.
// Army: (36,34) by t25, (44,42) by t50, the centre by t75 and it holds there
// (median army position t100-t400 is (50,50)). Scouts: own-side ranged flag at
// t54, the centre at t84, then attack flags (t140-190) and heal flags
// (t190-400); it ends holding all seven flags in 92 of 145 games. First contact
// median t100. Fights: 89% of a tick's shots on one target, prehealing on 55%
// of heals, ranged about 3.7 from the nearest enemy.
import { readFileSync } from 'node:fs';
import { persona } from './persona.mjs';

const learned = JSON.parse(
  readFileSync(new URL('./temik911.policy.json', import.meta.url), 'utf8'),
);

export const loop = persona({
  path: [
    [0, 36, 34],
    [25, 44, 42],
    [50, 50, 50],
  ],
  scouts: [
    ['R', 'A', 'H'],
    ['V', 'A', 'H', 'R'],
  ],
  engage: 7,
  chase: 6,
  rangedRange: 3,
  preheal: true,
  policy: learned.table,
});
