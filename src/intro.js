// The opening moment: the lamp comes up, then the jars light one after another.
// A pure model: the page holds when it began and hands the age in.
export const INTRO = { room: 900, first: 450, gap: 380, wake: 700 };

const ease = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

// How long the whole opening takes for `n` jars.
export const introMs = (n) => INTRO.first + INTRO.gap * Math.max(0, n - 1) + INTRO.wake;

// { room, jars: [..] } each 0 (dark) .. 1 (lit) at `ageMs`, or null once it is
// over (or was never begun): null means everything is simply lit.
export function introLevels(ageMs, n) {
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= introMs(n)) return null;
  const jars = [];
  for (let i = 0; i < n; i++) jars.push(ease((ageMs - INTRO.first - i * INTRO.gap) / INTRO.wake));
  return { room: ease(ageMs / INTRO.room), jars };
}
