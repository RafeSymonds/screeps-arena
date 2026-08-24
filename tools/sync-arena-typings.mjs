/**
 * Vendor the arena-specific typings (`arena/<season>/<arena>/<mode>`) that ship
 * inside the game client's arena-definitions folder.
 *
 * Each file declares one ambient module, so the module name — not the path it
 * happened to ship at — decides where it lands here. Several files often
 * declare the *same* module (one per prototype), so those are concatenated;
 * TypeScript merges repeated ambient declarations of one module.
 *
 * Usage: node tools/sync-arena-typings.mjs <arena-definitions-dir> <out-dir>
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [, , defsDir, outDir] = process.argv;
if (!defsDir || !outDir) {
  console.error('usage: node tools/sync-arena-typings.mjs <arena-definitions-dir> <out-dir>');
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith('.ts')) yield full;
  }
}

const modules = new Map();
for (const file of walk(defsDir)) {
  const source = readFileSync(file, 'utf8');
  const name = source.match(/declare module "([^"]+)"/)?.[1];
  // The base `game/*` typings ship here too; those are synced separately.
  if (!name || !name.startsWith('arena/')) continue;
  const blocks = modules.get(name) ?? [];
  if (!blocks.includes(source)) blocks.push(source);
  modules.set(name, blocks);
}

rmSync(outDir, { recursive: true, force: true });
for (const [name, blocks] of modules) {
  const target = path.join(outDir, `${name.slice('arena/'.length)}.d.ts`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, blocks.map(b => b.trimEnd()).join('\n\n') + '\n');
}

console.log(`vendored ${modules.size} arena modules to ${outDir}`);
for (const name of [...modules.keys()].sort()) {
  const n = modules.get(name).length;
  console.log(`  ${name}${n > 1 ? ` (${n} declarations merged)` : ''}`);
}
