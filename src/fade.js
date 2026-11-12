// A new reading does not snap the sky: the old weather fades into the new one.
// A pure model; the page holds what was drawn before and when the answer came.
export const FADE_MS = 2500;

// Whether two readings of one city paint a different sky (so a fade is worth it).
export function skyChanged(a, b) {
  if (!a || !b) return false;
  const cover = (w) => (typeof w.cloudCover === 'number' ? Math.round(w.cloudCover / 10) : -1);
  return !!a.known !== !!b.known || a.kind !== b.kind || cover(a) !== cover(b);
}

// 0 (all the old sky) .. 1 (all the new) `ageMs` after the answer; eased.
export function fadeAmount(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs >= FADE_MS) return 1;
  const x = Math.max(0, ageMs / FADE_MS);
  return x * x * (3 - 2 * x);
}
