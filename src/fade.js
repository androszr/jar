// A new reading does not snap the sky: the old weather fades into the new one.
// A pure model; the page holds what was drawn before and when the answer came.
export const FADE_MS = 2500;

// Every number the drawing reads, exactly as the vendor gave it (no rounding: a
// 0.1 s change of wave period already re-seeds Nazare's wave). `daily` and
// `hourly` feed the card and the scrub, not the picture of now, so they stay out.
export function pictureKey(w) {
  if (!w) return null;
  return JSON.stringify({
    known: !!w.known,
    kind: w.kind,
    code: w.code ?? null,
    temperature: w.temperature ?? null,
    cloudCover: w.cloudCover ?? null,
    cloudLow: w.cloudLow ?? null, // Warsaw's cloud base; mid and high are not drawn
    isDay: w.isDay ?? null,
    windSpeed: w.windSpeed ?? null,
    windDir: w.windDir ?? null,
    sea: w.sea ? { waveHeight: w.sea.waveHeight ?? null, wavePeriod: w.sea.wavePeriod ?? null, waveDir: w.sea.waveDir ?? null } : null,
  });
}

// Whether two readings of one city paint a different picture (so a fade is worth it).
export function pictureChanged(a, b) {
  if (!a || !b) return false;
  return pictureKey(a) !== pictureKey(b);
}

// What fades after a frame: `current` and `lastFeed` map a city id to the reading
// the feed handed back this frame and the last; `fade` false takes a change at once.
// The stale drop (held reading -> EMPTY) and the recovery change what `get` hands
// back, so they fade like any new reading.
export function nextFades(fades, lastFeed, current, t, fade) {
  const next = { ...fades };
  if (fade) {
    for (const id of Object.keys(current)) {
      const was = lastFeed[id];
      if (!(was && was !== current[id] && pictureChanged(was, current[id]))) continue;
      // A change that lands on a young fade keeps the older picture as its start, so
      // the screen never cuts to the in-between one (a hidden tab's stale drop and
      // the answer that follows it a moment later).
      const old = fades[id];
      if (old && fadeAmount(t - old.start) < 0.5) {
        if (pictureChanged(old.from, current[id])) next[id] = { from: old.from, start: t };
        else delete next[id];
      } else next[id] = { from: was, start: t };
    }
  }
  return { fades: next, lastFeed: current };
}

// 0 (all the old sky) .. 1 (all the new) `ageMs` after the answer; eased.
export function fadeAmount(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs >= FADE_MS) return 1;
  const x = Math.max(0, ageMs / FADE_MS);
  return x * x * (3 - 2 * x);
}
