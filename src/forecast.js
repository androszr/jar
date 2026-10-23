// Where the forecast card stands when a jar is lifted. Geometry only: no
// drawing, no DOM, no clock. One rule that branches on the screen's shape
// (portrait -> a row of five below the jar, otherwise a column to its right).

export const CARD = {
  column: { w: 170, h: 360 },
  row: { w: 340, h: 134 },
  strip: { column: 30, row: 24 },
  gap: 14,
  drop: 36,
};

const lerp = (a, b, t) => a + (b - a) * t;

// The card's resting rect and layout beside/below `jar` ({ x, y, w, h }).
function resting(jar, portrait) {
  if (portrait) {
    const { w, h } = CARD.row;
    return { layout: 'row', rect: { x: jar.x + jar.w / 2 - w / 2, y: jar.y + jar.h + CARD.drop, w, h } };
  }
  const { w, h } = CARD.column;
  return { layout: 'column', rect: { x: jar.x + jar.w + CARD.gap, y: jar.y + jar.h / 2 - h / 2, w, h } };
}

// The card at `reveal` 0..1 (the lift's own progress): { rect, layout, alpha },
// or null while hidden. At 0 it would sit fully behind the jar.
export function forecastPose(jar, portrait, reveal) {
  if (!(reveal > 0)) return null;
  const r = Math.min(1, reveal);
  const { layout, rect } = resting(jar, portrait);
  const hidden = layout === 'row'
    ? { ...rect, y: jar.y + jar.h - rect.h }
    : { ...rect, x: jar.x + jar.w - rect.w };
  return {
    layout,
    alpha: r,
    rect: { x: lerp(hidden.x, rect.x, r), y: lerp(hidden.y, rect.y, r), w: rect.w, h: rect.h },
  };
}

// The jar and its resting card together: what the lift camera keeps in view.
export function forecastExtent(jar, portrait) {
  const { rect } = resting(jar, portrait);
  const x0 = Math.min(jar.x, rect.x);
  const y0 = Math.min(jar.y, rect.y);
  const x1 = Math.max(jar.x + jar.w, rect.x + rect.w);
  const y1 = Math.max(jar.y + jar.h, rect.y + rect.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
