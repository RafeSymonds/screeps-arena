// Reader for the game client's Chromium HTTP cache.
//
// Arena contents and match history are server-side, but everything the client
// fetched is sitting in its cache: game records, whole replays, and the console
// output your own bot printed. This is the only way to look at a finished match
// from outside the client.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

export const CACHE_DIR =
  process.env.ARENA_CACHE_DIR ||
  path.join(homedir(), 'Library/Application Support/screeps_arena/Cache/Cache_Data');

/** Skip a gzip header, including whatever optional fields FLG announces. */
function deflateStart(buf, at) {
  // Most of this cache is artwork, and 1f 8b turns up inside images by chance,
  // so every step is bounded rather than trusting the header.
  if (buf[at + 2] !== 8) return -1;
  const flags = buf[at + 3];
  let p = at + 10;
  if (flags & 4) {
    if (p + 2 > buf.length) return -1;
    p += 2 + buf.readUInt16LE(p);
  }
  for (const flag of [8, 16]) {
    if (!(flags & flag)) continue;
    while (p < buf.length && buf[p] !== 0) p += 1;
    p += 1;
  }
  if (flags & 2) p += 2;
  return p < buf.length ? p : -1;
}

/**
 * Entries store the request URL as plain text followed by a gzip body and
 * Chromium's own trailer. `gunzipSync` refuses the trailer, so the header is
 * skipped by hand and the deflate stream inflated raw — which also copes with
 * the cache having truncated a large body, which it does routinely.
 */
export function readEntries({ match } = {}) {
  const out = [];
  for (const name of readdirSync(CACHE_DIR)) {
    if (!name.endsWith('_0')) continue;
    const file = path.join(CACHE_DIR, name);
    const raw = readFileSync(file);
    const url = raw
      .subarray(0, 800)
      .toString('latin1')
      .match(/https:\/\/arena\.screeps\.com\/\S+/)?.[0]
      ?.replace(/[^\x20-\x7e].*$/, '');
    if (!url) continue;
    if (match && !url.includes(match)) continue;

    const magic = raw.indexOf(Buffer.from([0x1f, 0x8b]));
    let body = null;
    if (magic >= 0) {
      const start = deflateStart(raw, magic);
      if (start >= 0) {
        try {
          body = zlib
            .inflateRawSync(raw.subarray(start), { finishFlush: zlib.constants.Z_SYNC_FLUSH })
            .toString('utf8');
        } catch {
          body = null;
        }
      }
    }
    out.push({ url, body, mtime: statSync(file).mtime });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export const json = text => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Replay chunks are frequently truncated by the cache. Recover every complete
 * frame rather than throwing the whole chunk away.
 */
export function framesOf(body) {
  if (!body) return [];
  const whole = json(body);
  if (Array.isArray(whole)) return whole;
  const cut = body.lastIndexOf('},{"gameTime"');
  if (cut < 0) return [];
  return json(`${body.slice(0, cut)}}]`) ?? [];
}

/** Everything cached about one game, keyed by id. */
export function collectGames() {
  const games = new Map();
  const touch = id => {
    if (!games.has(id)) games.set(id, { id, record: null, frames: [], logs: [], mtime: 0 });
    return games.get(id);
  };

  for (const entry of readEntries({ match: '/api/game/' })) {
    const replay = entry.url.match(/\/api\/game\/([a-f0-9]+)\/replay\/(\d+)/);
    if (replay) {
      const game = touch(replay[1]);
      game.frames.push(...framesOf(entry.body));
      game.mtime = Math.max(game.mtime, entry.mtime.getTime());
      continue;
    }
    const log = entry.url.match(/\/api\/game\/([a-f0-9]+)\/log\/(\d+)/);
    if (log) {
      const game = touch(log[1]);
      const parsed = json(entry.body);
      if (parsed) {
        for (const [tick, text] of Object.entries(parsed)) {
          if (text) game.logs.push({ tick: Number(tick), text });
        }
      }
      continue;
    }
    const record = entry.url.match(/\/api\/game\/([a-f0-9]+)$/);
    if (record) {
      const doc = json(entry.body);
      if (doc?.game?.game?.terrain) {
        const game = touch(record[1]);
        game.record = doc.game;
        game.mtime = Math.max(game.mtime, entry.mtime.getTime());
      }
    }
  }

  for (const game of games.values()) {
    game.frames.sort((a, b) => a.gameTime - b.gameTime);
    game.logs.sort((a, b) => a.tick - b.tick);
  }
  return [...games.values()].sort((a, b) => b.mtime - a.mtime);
}

/**
 * Which side you were, worked out from the first tick of your own console
 * output — the bot prints where its spawn is, and that is unambiguous. The
 * game record's player ordering is not: `usersCode` order and
 * `firstPlayerIndex` do not line up with the `player1`/`player2` in replays.
 */
export function sideFromLog(game) {
  const first = game.logs.find(l => l.text.includes('spawn mine'));
  const at = first?.text.match(/spawn mine \((\d+),(\d+)\)/);
  if (!at) return null;
  const spawn = game.frames[0]?.objects?.find(
    o => o.prototypeName === 'StructureSpawn' && o.x === Number(at[1]) && o.y === Number(at[2]),
  );
  return spawn?.user ?? (Number(at[2]) < 50 ? 'player1' : 'player2');
}

/**
 * `result.winner` is your score, not a player index: 1 you won, 0 you lost,
 * 0.5 a draw. (Confirmed against rating movement: a 0 sat next to 1086 -> 801.)
 */
export function outcomeOf(record) {
  const score = record?.game?.result?.winner;
  if (score === 1) return 'win';
  if (score === 0) return 'loss';
  if (score === 0.5) return 'draw';
  return 'unknown';
}
