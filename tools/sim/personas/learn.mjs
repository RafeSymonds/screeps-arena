// Learns a persona's fight movement from a player's archived replays.
//
//   node tools/sim/personas/learn.mjs <player> [archive dirs…] > personas/<player>.policy.json
//
// For every tick one of the player's fighting creeps has an armed enemy within
// 8 tiles, it records the situation (role, health, distance to the nearest
// armed enemy, armed friends minus armed enemies within 5) and what the creep
// did next tick: closed in, held, or backed off from that enemy. The persona
// replays the most common choice for the situation it is in.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [who, ...dirs] = process.argv.slice(2);
const R = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const armed = o =>
  o.body.some(b => (b.type === 'attack' || b.type === 'ranged_attack') && b.hits > 0);
const role = o =>
  o.body.some(b => b.type === 'attack')
    ? 'M'
    : o.body.some(b => b.type === 'ranged_attack')
      ? 'R'
      : o.body.some(b => b.type === 'heal')
        ? 'H'
        : 'S';

export const key = (r, hpFrac, d, balance) =>
  `${r}|${hpFrac >= 0.75 ? 'hi' : hpFrac >= 0.5 ? 'mid' : 'lo'}|${Math.min(d, 8)}|${Math.max(-3, Math.min(3, balance))}`;

const table = {};
let games = 0;
for (const d of dirs) {
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json.gz')) continue;
    let g;
    try {
      g = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(d, f))));
    } catch {
      continue;
    }
    const r = g.record;
    if (!r?.game?.usersCode) continue;
    const cu = Object.fromEntries(r.codes.map(c => [c._id, c.user]));
    const un = Object.fromEntries(r.users.map(u => [u._id, u.username]));
    const fpi = r.game.firstPlayerIndex ?? 0;
    const side =
      un[cu[r.game.usersCode[fpi]]] === who
        ? 'player1'
        : un[cu[r.game.usersCode[1 - fpi]]] === who
          ? 'player2'
          : null;
    if (!side) continue;
    games += 1;
    for (let i = 0; i + 1 < g.frames.length; i += 1) {
      const A = g.frames[i].objects.filter(o => o.prototypeName === 'Creep');
      const B = Object.fromEntries(
        g.frames[i + 1].objects.filter(o => o.prototypeName === 'Creep').map(o => [o._id, o]),
      );
      const mine = A.filter(o => o.user === side);
      const them = A.filter(o => o.user !== side && armed(o));
      if (them.length === 0) continue;
      for (const c of mine) {
        const ro = role(c);
        if (ro === 'S') continue;
        const near = them.reduce((b, e) => (!b || R(c, e) < R(c, b) ? e : b), null);
        const dist = R(c, near);
        if (dist > 8) continue;
        const next = B[c._id];
        if (!next) continue;
        const nearNext = B[near._id] ?? near;
        // Move relative to where the enemy was, so its own step does not count.
        const delta = Math.sign(R(next, near) - dist);
        const bal =
          mine.filter(o => armed(o) && R(o, c) <= 5).length - them.filter(o => R(o, c) <= 5).length;
        const k = key(ro, c.hits / c.hitsMax, dist, bal);
        const t = (table[k] ??= { in: 0, hold: 0, out: 0 });
        t[delta < 0 ? 'in' : delta > 0 ? 'out' : 'hold'] += 1;
        void nearNext;
      }
    }
  }
}
process.stdout.write(JSON.stringify({ player: who, games, table }, null, 0));
