import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const banner = '// Auto-generated via npm run build. Edit files in src/ only.\n';

export default {
  input: path.join(__dirname, 'dist', 'main.js'),
  output: {
    file: path.join(__dirname, 'main.mjs'),
    format: 'esm',
    banner,
    inlineDynamicImports: true
  },
  treeshake: false,
  external: (id) => id === 'game' || id.startsWith('game/')
};
