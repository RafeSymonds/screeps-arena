import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function buildMode(modeDir) {
  const projectDir = path.resolve(modeDir);
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');

  const tsc = spawnSync('npx', ['tsc', '-p', tsconfigPath], {
    stdio: 'inherit'
  });

  if (tsc.status !== 0) {
    const code = tsc.status ?? 1;
    console.error(`tsc failed for ${modeDir}`);
    process.exit(code);
  }

  const distFile = path.join(projectDir, 'dist', 'main.js');
  const outputFile = path.join(projectDir, 'main.mjs');
  const compiled = await readFile(distFile, 'utf8');
  const header = '// Auto-generated via npm run build. Edit files in src/ only.\n';
  await writeFile(outputFile, `${header}${compiled}`, 'utf8');
  console.log(`Created ${path.relative(process.cwd(), outputFile)}`);
}

async function main() {
  const modes = process.argv.slice(2);
  if (modes.length === 0) {
    console.error('Usage: node scripts/build-mode.mjs <modeDir> [...]');
    process.exit(1);
  }

  for (const mode of modes) {
    await buildMode(mode);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
