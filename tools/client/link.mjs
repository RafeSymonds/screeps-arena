// Point the client's script folder for an arena at this repo's game/<arena>,
// so what `bin/arena build`/`deploy` writes is what the client plays when you
// press Play by hand. (`bin/arena test`/`play` upload dist/ directly and do not
// depend on this.)
//
//   node tools/client/link.mjs <game-dir> [arena-folder ...]   default: every unlocked arena
//
// The client keeps the folder per arena in localStorage under
// arena_local_settings_<arenaId>_running_game -> { sourceFolder }, and on
// selecting a folder asks its main process to copy the arena's typings into it
// (ipc-arena::sync-folder). This does both.
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { connect } from './cdp.mjs';
import { allArenas } from './games.mjs';

const [gameDir, ...wanted] = process.argv.slice(2);
if (!gameDir) {
  console.error('usage: link.mjs <game-dir> [arena-folder ...]');
  process.exit(1);
}

const client = await connect();
try {
  const arenas = (await allArenas(client.api)).filter(a =>
    wanted.length ? wanted.includes(a.folderName) : a.unlocked && a.active,
  );
  if (arenas.length === 0)
    throw new Error(`no matching arenas (${wanted.join(', ') || 'unlocked'})`);
  for (const arena of arenas) {
    const folder = path.resolve(gameDir, arena.folderName);
    mkdirSync(folder, { recursive: true });
    const key = `arena_local_settings_${arena._id}_running_game`;
    const result = await client.evaluate(`(async () => {
      const key = ${JSON.stringify(key)};
      const settings = JSON.parse(localStorage.getItem(key) || '{}');
      const before = settings.sourceFolder || null;
      settings.sourceFolder = ${JSON.stringify(folder)};
      localStorage.setItem(key, JSON.stringify(settings));
      await window.ipcRenderer.invoke('ipc-arena::sync-folder', { arenaId: ${JSON.stringify(arena._id)}, sourceFolder: settings.sourceFolder });
      return before;
    })()`);
    console.log(`${arena.folderName}: ${result ?? '(unset)'} -> ${folder}`);
  }
  console.log(
    '\nRestart the client (or switch arenas) if the Play screen still shows the old folder.',
  );
} finally {
  client.close();
}
