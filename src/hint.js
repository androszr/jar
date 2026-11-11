// The chalk "tap a jar" hint, on a small slate lying on the table: a pure model, no DOM, no drawing.
// State is 'shown' | 'fading' | 'none', held by the page for one load only.

// The lettering's midline: the spill under the jars ends at scene y 774 (jar
// light pool, 664..774), the table seams sit every 44 px from 680 (812, 856),
// and the front edge is at 940. 834 is the middle of the free band 812..856.
export const HINT_Y = 834;
export const HINT_SIZE = 20;

export const hintWording = (coarse) => (coarse ? 'tap a jar' : 'click a jar');

export const hintSentence = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)} to lift it.`;

export const initialHint = (jarParamValid) => (jarParamValid ? 'none' : 'shown');

export const hintOnLift = (state) => (state === 'shown' ? 'fading' : state);

// A fade ends when the lift lands, and also when the lift is called off part-way (the jar is on its
// way down or back on the table): the hint has done its job and never comes back.
export const hintAfter = (state, progress, liftState = 'lifting') =>
  (state === 'fading' && (progress >= 1 || liftState === 'lowering' || liftState === 'closed') ? 'none' : state);

export function hintAlpha(state, progress) {
  if (state === 'shown') return 1;
  if (state === 'fading') return Math.max(0, Math.min(1, 1 - progress));
  return 0;
}

export const hintPose = (cx) => ({ x: cx, y: HINT_Y, size: HINT_SIZE });
