// HAND-WRITTEN — unlike the rest of typings/, this file is not generated and
// `bin/arena sync` will not overwrite it.
//
// The sandbox provides these, but the typings shipped with the client omit
// them. `arenaInfo` is in the official docs (docs/api/arenaInfo.md) yet absent
// from game/index.d.ts; `console` is available in the sandbox but declared
// nowhere, and the tsconfig deliberately excludes the DOM lib.

declare const console: {
  log(...data: unknown[]): void;
};

declare module 'game' {
  /** Metadata about the arena the current match is running in. */
  export const arenaInfo: {
    /** The name of the arena. */
    readonly name: string;
    /** The name of the season this arena belongs to. */
    readonly season: string;
    /** 1 for a basic arena, 2 for advanced. */
    readonly level: number;
    /** Game ticks limit. */
    readonly ticksLimit: number;
    /** CPU wall time execution limit per tick, in nanoseconds. */
    readonly cpuTimeLimit: number;
    /** CPU wall time limit on the first tick, in nanoseconds. */
    readonly cpuTimeLimitFirstTick: number;
  };
}
