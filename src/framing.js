// Framing: the scene is 1600x1000 logical units. A wide screen (4:3 or wider)
// shows all of it, letterboxed; a taller one shows a full-height slice
// centred on the focused jar.

export const SCENE = { w: 1600, h: 1000 };
export const WIDE_ASPECT = 4 / 3;

// The slice of the scene a screen of `aspect` (width / height) shows, as
// { x, w }, centred on `centreX` and clamped inside a scene `viewW` wide.
export function sliceFor(aspect, centreX, viewW = SCENE.w) {
  if (!(aspect > 0) || aspect >= WIDE_ASPECT) return { x: 0, w: viewW };
  const w = Math.min(viewW, SCENE.h * aspect);
  const x = Math.max(0, Math.min(viewW - w, centreX - w / 2));
  return { x, w };
}

// The camera for a view of innerW x innerH CSS px: { cx, cy, scale } mapping
// scene units to CSS px, centred on (cx, cy).
export function fitScreen(innerW, innerH, centreX = SCENE.w / 2) {
  const aspect = innerW / innerH;
  const slice = sliceFor(aspect, centreX);
  const scale = Math.min(innerW / slice.w, innerH / SCENE.h);
  return { cx: slice.x + slice.w / 2, cy: SCENE.h / 2, scale, slice, portrait: aspect < WIDE_ASPECT };
}
