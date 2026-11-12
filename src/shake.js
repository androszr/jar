// A shaken jar: a pure model. The page holds when the shake began; everything
// drawn from it is a function of the age handed in here, never of a clock.
export const SHAKE_MS = 2600;
const RISE_MS = 260;

// The shake `ageMs` after it began: { tilt (radians the jar leans), slosh (px
// the diorama slides sideways), swirl (0..1, how much is in the air) }, or
// null when there is none (not begun, over, or reduced motion).
export function shakeAt(ageMs, reduced = false) {
  if (reduced || !Number.isFinite(ageMs) || ageMs < 0 || ageMs >= SHAKE_MS) return null;
  const settle = 1 - (ageMs - RISE_MS) / (SHAKE_MS - RISE_MS);
  return {
    ageMs,
    tilt: 0.05 * Math.exp(-ageMs / 330) * Math.sin(ageMs / 70),
    slosh: 7 * Math.exp(-ageMs / 420) * Math.sin(ageMs / 95 + 0.8),
    swirl: ageMs < RISE_MS ? ageMs / RISE_MS : settle * settle,
  };
}
