// Local archive of finished matches written by tools/client/fetch.mjs.
//
// One gzipped JSON file per game, in the same shape collectGames() returns for
// cached games ({ id, record, frames, logs }), so every reader works on both.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ARCHIVE_DIR = process.env.ARENA_ARCHIVE_DIR || path.join(ROOT, 'matches');

const fileOf = id => path.join(ARCHIVE_DIR, `${id}.json.gz`);

export const archived = id => existsSync(fileOf(id));

export function writeArchive(game) {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  writeFileSync(fileOf(game.id), zlib.gzipSync(JSON.stringify(game)));
}

export function readArchive() {
  if (!existsSync(ARCHIVE_DIR)) return [];
  const games = [];
  for (const name of readdirSync(ARCHIVE_DIR)) {
    if (!name.endsWith('.json.gz')) continue;
    const file = path.join(ARCHIVE_DIR, name);
    try {
      const game = JSON.parse(zlib.gunzipSync(readFileSync(file)).toString('utf8'));
      const created = Date.parse(game.record?.game?.createdAt ?? '');
      game.mtime = Number.isNaN(created) ? statSync(file).mtimeMs : created;
      games.push(game);
    } catch {
      console.error(`skipping unreadable archive file ${file}`);
    }
  }
  return games;
}
