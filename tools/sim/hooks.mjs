// Resolve hook that points the sandbox's bare `game/*` specifiers at the stub
// modules. Registering this lets the simulator import the real built bundle
// straight out of dist/ — the same file the client runs — rather than a
// rewritten copy that could drift from it.
const STUBS = new URL('./stubs/', import.meta.url);

const MODULES = {
  game: 'game.mjs',
  'game/utils': 'utils.mjs',
  'game/constants': 'constants.mjs',
  'game/prototypes': 'prototypes.mjs',
  'game/path-finder': 'path-finder.mjs',
  'game/visual': 'visual.mjs',
  'arena/season_4/pain_and_gain/basic': 'pain-and-gain.mjs',
};

export function resolve(specifier, context, next) {
  let file = MODULES[specifier];
  // `game/prototypes/creep` and friends all re-export from the one stub.
  if (!file && specifier.startsWith('game/prototypes/')) file = 'prototypes.mjs';
  if (file) return { url: new URL(file, STUBS).href, shortCircuit: true };
  return next(specifier, context);
}
