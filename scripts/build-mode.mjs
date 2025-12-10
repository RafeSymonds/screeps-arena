import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const windowsCopyRoot =
  process.env.WINDOWS_ARENA_COPY_PATH ?? '/mnt/c/Users/rafes/ScreepsArena';

async function fileExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyToWindows(outputFile, contents) {
  if (!windowsCopyRoot) {
    return;
  }

  const relativeOutput = path.relative(repoRoot, outputFile);
  const windowsTarget = path.join(windowsCopyRoot, relativeOutput);

  try {
    await mkdir(path.dirname(windowsTarget), { recursive: true });
    await writeFile(windowsTarget, contents, 'utf8');
    console.log(`Copied ${relativeOutput} -> ${windowsTarget}`);
  } catch (error) {
    console.warn(`Failed to copy ${relativeOutput} to ${windowsTarget}: ${error.message}`);
  }
}

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

  const rollupConfig = path.join(projectDir, 'rollup.config.mjs');
  const outputFile = path.join(projectDir, 'main.mjs');

  if (await fileExists(rollupConfig)) {
    const rollup = spawnSync('npx', ['rollup', '--config', rollupConfig], {
      stdio: 'inherit'
    });

    if (rollup.status !== 0) {
      const code = rollup.status ?? 1;
      console.error(`rollup failed for ${modeDir}`);
      process.exit(code);
    }

    const bundled = await readFile(outputFile, 'utf8');
    console.log(`Bundled ${path.relative(process.cwd(), outputFile)} via Rollup`);
    await copyToWindows(outputFile, bundled);
    return;
  }

  const distFile = path.join(projectDir, 'dist', 'main.js');
  const compiled = await readFile(distFile, 'utf8');
  const header = '// Auto-generated via npm run build. Edit files in src/ only.\n';
  const outputContents = `${header}${compiled}`;
  await writeFile(outputFile, outputContents, 'utf8');
  console.log(`Created ${path.relative(process.cwd(), outputFile)}`);
  await copyToWindows(outputFile, outputContents);
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
