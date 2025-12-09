# Screeps Arena TypeScript Setup

This repository now uses a shared TypeScript toolchain for every arena mode.

## Getting started

1. Install dependencies once: `npm install`.
2. Add or edit the code for a game mode under `<mode>/src/main.ts`. For example, the Spawn Strike entry point lives at `season1-spawn_strike/src/main.ts`.
3. Compile TypeScript into the `.mjs` file required by the Screeps Arena client with one of the build scripts:
   - `npm run build:season1_spawn_strike`
   - `npm run build:season1_portal_exploration`
   - `npm run build:season1_portal_exploration_advanced`
   - `npm run build:season1_construct_and_control`
   - `npm run build:season1_construct_and_control_advanced`
   - `npm run build:season1_spawn_strike_advanced`
   - `npm run build:beta_capture_the_flag`
   - `npm run build:tutorial`
   - or `npm run build` to compile every mode.

Each build drops the compiled JavaScript in `<mode>/dist/main.js` and also overwrites `<mode>/main.mjs` with the same code plus a banner explaining that it is generated. Upload the resulting `main.mjs` to Screeps Arena just like before.

Type declarations from each arena mode live in `<mode>/typings` and are automatically wired through the local `tsconfig.json`, so you get type checking and IntelliSense while you write your strategies.
