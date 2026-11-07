// Pulling one finished game off the arena API into the local archive.
import { archived, writeArchive } from '../replay/archive.mjs';

// The client fetches replays and logs in chunks named by their last tick:
// tick 0 alone, then 1-100 as "100", 101-200 as "200", ... up to the end.
const CHUNK = 100;
const chunkEnds = ticks => {
  const ends = [0];
  for (let end = CHUNK; end < ticks; end += CHUNK) ends.push(end);
  if (ticks > 0) ends.push(ticks);
  return ends;
};

/** Archive game `id`; returns a one-line description, or 'have' if already archived. */
export async function archiveGame(api, id, { arenaId = null, force = false, extra = {} } = {}) {
  if (!force && archived(id)) return 'have';
  const { game: record } = await api(`/game/${id}`);
  const ticks = record?.game?.meta?.ticks ?? 0;
  const frames = [];
  const logs = [];
  for (const end of chunkEnds(ticks)) {
    const chunk = await api(`/game/${id}/replay/${end}`);
    if (Array.isArray(chunk)) frames.push(...chunk);
    if (end === 0) continue;
    // Log chunks are objects keyed by absolute tick ("101".."200"), with an
    // empty string for ticks that printed nothing.
    const log = await api(`/game/${id}/log/${end}`).catch(() => null);
    if (!log || typeof log !== 'object') continue;
    for (const [k, text] of Object.entries(log)) {
      if (!text) continue;
      logs.push({ tick: Number(k), text: typeof text === 'string' ? text : JSON.stringify(text) });
    }
  }
  frames.sort((a, b) => a.gameTime - b.gameTime);
  writeArchive({
    id,
    arenaId,
    fetchedAt: new Date().toISOString(),
    ...extra,
    record,
    frames,
    logs,
  });
  return `${frames.length} frames, ${logs.length} log lines`;
}

/** Every arena of every season, each tagged with its season. */
export async function allArenas(api) {
  const { seasons } = await api('/season/list');
  const all = [];
  for (const season of seasons ?? []) {
    const { arenas } = await api(`/season/${season._id}/arenas`);
    for (const arena of arenas ?? []) all.push({ ...arena, seasonName: season.name });
  }
  return all;
}
