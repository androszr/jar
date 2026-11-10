// Lantern's forecast card: a dark plate with a brass edge (as the label's),
// five days of icon, high and low in monospace, and the seven weather glyphs.
// Colours only from PALETTE, text only through text().
import { PALETTE, css } from './palette.js';
import { text, fitSize } from './draw.js';
import { formatTideStrip, formatTideHeight, tideCurve } from '../../weather.js';
import { CARD } from '../../forecast.js';

function cloudShape(ctx, x, y, s, colour) {
  ctx.fillStyle = css(colour, 0.95);
  for (const [dx, dy, rx, ry] of [[-0.22, 0.05, 0.26, 0.18], [0.06, -0.08, 0.28, 0.24], [0.28, 0.06, 0.22, 0.16]]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// One glyph centred on (x, y), roughly `size` px across. `kind` is a weather kind.
export function weatherIcon(ctx, kind, x, y, size) {
  const s = size;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, s * 0.07);
  switch (kind) {
    case 'clear':
      ctx.fillStyle = css(PALETTE.sun);
      ctx.beginPath();
      ctx.arc(x, y, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'fog':
      ctx.strokeStyle = css(PALETTE.fog, 0.9);
      for (const [dy, half] of [[-0.2, 0.3], [0, 0.4], [0.2, 0.3]]) {
        ctx.beginPath();
        ctx.moveTo(x - half * s, y + dy * s);
        ctx.lineTo(x + half * s, y + dy * s);
        ctx.stroke();
      }
      break;
    case 'drizzle':
      cloudShape(ctx, x, y - s * 0.12, s, PALETTE.cloud);
      ctx.fillStyle = css(PALETTE.rain);
      for (const dx of [-0.12, 0.14]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + s * 0.3, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'rain':
      cloudShape(ctx, x, y - s * 0.12, s, PALETTE.cloud);
      ctx.strokeStyle = css(PALETTE.rain);
      for (const dx of [-0.2, 0, 0.2]) {
        ctx.beginPath();
        ctx.moveTo(x + dx * s, y + s * 0.2);
        ctx.lineTo(x + (dx - 0.05) * s, y + s * 0.38);
        ctx.stroke();
      }
      break;
    case 'snow':
      cloudShape(ctx, x, y - s * 0.12, s, PALETTE.cloud);
      ctx.fillStyle = css(PALETTE.snow);
      for (const dx of [-0.2, 0, 0.2]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + s * 0.3, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'storm':
      cloudShape(ctx, x, y - s * 0.12, s, PALETTE.cloud);
      ctx.fillStyle = css(PALETTE.flash);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.04, y + s * 0.12);
      ctx.lineTo(x - s * 0.1, y + s * 0.32);
      ctx.lineTo(x + s * 0.0, y + s * 0.3);
      ctx.lineTo(x - s * 0.06, y + s * 0.48);
      ctx.lineTo(x + s * 0.12, y + s * 0.24);
      ctx.lineTo(x + s * 0.02, y + s * 0.26);
      ctx.closePath();
      ctx.fill();
      break;
    default: // cloud
      cloudShape(ctx, x, y, s, PALETTE.cloud);
  }
  ctx.restore();
}

// The card on `rect`: `cells` is five { day, kind, high, low, swell, rain, wind,
// windArrow }; `layout` is 'column' (five rows) or 'row' (five columns). A cell
// with `today` gets a brass band, a brighter day name and a short underline
// under that name; `sun` ({ sunrise, sunset } or null) adds one strip along the
// bottom edge and `tides` (today's { time, kind } entries, [] for none) a
// second strip under it. A missing rain or wind figure leaves its line empty.
// Text never drops under FLOOR px (12.5 in the row, 12 in the column).
export function forecastCard(ctx, rect, cells, layout, sun = null, sunT = null, tides = [], dayT = null) {
  const { x, y, w } = rect;
  const key = layout === 'row' ? 'row' : 'column';
  const floor = layout === 'row' ? 12.5 : 12;
  const strip = sun ? CARD.strip[key] : 0;
  const arcH = sun ? CARD.arc[key] : 0;
  const strips = formatTideStrip(tides);
  const tideH = strips ? CARD.tide[key] : 0;
  const curveH = strips ? CARD.curve[key] : 0;
  const h = rect.h - strip - arcH - tideH - curveH;
  ctx.save();
  ctx.fillStyle = css(PALETTE.plate, 0.88);
  ctx.beginPath();
  ctx.roundRect(x, y, w, rect.h, 5);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(PALETTE.brass, 0.85);
  ctx.stroke();
  const n = cells.length || 1;
  const swell = cells.some((c) => c && c.swell);
  const swellText = (c) => (c.swell ? c.swell.height : '—');
  const windText = (c) => (c.wind ? (c.windArrow ? `${c.wind} ${c.windArrow}` : c.wind) : null);
  if (layout === 'row') {
    // A line grid: day, icon (1.6 pitches), high, low, [swell], rain, wind.
    const lines = 5 + (swell ? 1 : 0) + 1;
    const p = h / (lines - 1 + 1.6);
    const big = Math.max(floor, p * 0.62);
    const small = Math.max(floor, p * 0.56);
    const cw = w / n;
    cells.forEach((c, i) => {
      const cx = x + cw * (i + 0.5);
      if (c.today) {
        ctx.fillStyle = css(PALETTE.brass, 0.12);
        ctx.fillRect(x + cw * i, y, cw, h);
      }
      const dayInk = c.today ? PALETTE.labelInk : PALETTE.labelDim;
      let row = 0.5;
      const at = () => y + p * row;
      text(ctx, c.day, cx, at(), big, dayInk);
      if (c.today) {
        ctx.fillStyle = css(PALETTE.labelInk, 0.9);
        ctx.fillRect(cx - cw * 0.21, y + p * 0.5 + big * 0.6, cw * 0.42, Math.max(1, p * 0.07));
      }
      weatherIcon(ctx, c.kind, cx, y + p * 1.8, Math.min(cw * 0.7, p * 1.5));
      row = 3.1;
      text(ctx, c.high, cx, at(), big, PALETTE.labelInk);
      row += 1;
      text(ctx, c.low, cx, at(), small, PALETTE.labelDim);
      if (swell) {
        row += 1;
        text(ctx, swellText(c), cx, at(), small, PALETTE.labelDim);
      }
      row += 1;
      if (c.rain) text(ctx, c.rain, cx, at(), small, PALETTE.rain);
      row += 1;
      // Tight columns: the unit and arrow close up so the figure never touches its neighbour.
      const wt = c.wind ? `${c.wind.replace(' ', '')}${c.windArrow || ''}` : null;
      if (wt) text(ctx, wt, cx, at(), Math.max(floor, fitSize(ctx, wt, small, cw * 0.96)), PALETTE.labelDim);
    });
  } else {
    const rh = h / n;
    cells.forEach((c, i) => {
      const cy = y + rh * (i + 0.5);
      if (c.today) {
        ctx.fillStyle = css(PALETTE.brass, 0.12);
        ctx.fillRect(x, y + rh * i, w, rh);
      }
      const dayInk = c.today ? PALETTE.labelInk : PALETTE.labelDim;
      const l1 = cy - rh * 0.18;
      const l2 = cy + rh * 0.24;
      text(ctx, c.day, x + w * 0.1, l1, Math.max(floor, rh * 0.26), dayInk, 'left');
      if (c.today) {
        // Drawn after the day name, so text() cannot repaint it.
        ctx.fillStyle = css(PALETTE.labelInk, 0.9);
        ctx.fillRect(x + w * 0.1, l1 + rh * 0.15, w * 0.2, Math.max(1, rh * 0.025));
      }
      weatherIcon(ctx, c.kind, x + w * 0.42, l1, rh * 0.44);
      text(ctx, c.high, x + w * 0.73, l1, Math.max(floor, rh * 0.26), PALETTE.labelInk, 'right');
      text(ctx, c.low, x + w * 0.95, l1, Math.max(floor, rh * 0.22), PALETTE.labelDim, 'right');
      const size2 = Math.max(floor, rh * 0.2);
      if (c.swell) text(ctx, swellText(c), x + w * 0.1, l2, size2, PALETTE.labelDim, 'left');
      else if (swell) text(ctx, '—', x + w * 0.1, l2, size2, PALETTE.labelDim, 'left');
      const wt = windText(c);
      const parts = [c.rain, wt].filter(Boolean);
      if (parts.length) {
        const str = parts.join('  ');
        const sz = Math.max(floor, fitSize(ctx, str, size2, w * 0.55));
        // Rain in its own ink, wind after it: two texts, the wind right-aligned.
        if (wt) text(ctx, wt, x + w * 0.95, l2, sz, PALETTE.labelDim, 'right');
        if (c.rain) {
          const rx = wt ? x + w * 0.95 - wt.length * sz * 0.62 - sz : x + w * 0.95;
          text(ctx, c.rain, rx, l2, sz, PALETTE.rain, 'right');
        }
      }
    });
  }
  if (sun) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = css(PALETTE.brass, 0.35);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h);
    ctx.lineTo(x + w * 0.92, y + h);
    ctx.stroke();
    text(ctx, `↑ ${sun.sunrise}  ↓ ${sun.sunset}`, x + w / 2, y + h + strip * 0.5, Math.max(floor, strip * 0.48), PALETTE.labelDim);
  }
  if (tideH) {
    // Today's tides, with or without a sun strip above: a hairline, then the
    // times with their heights (row: two lines on the left; column: one line
    // per extreme) and a small curve of the day with a dot for now (row: to the
    // right of the text; column: under it).
    const ty = y + h + strip;
    ctx.lineWidth = 1;
    ctx.strokeStyle = css(PALETTE.brass, 0.35);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, ty);
    ctx.lineTo(x + w * 0.92, ty);
    ctx.stroke();
    let box;
    if (layout === 'row') {
      const line = (str, ly) => text(ctx, str, x + w * 0.04, ly, Math.max(floor, fitSize(ctx, str, floor, w * 0.64)), PALETTE.labelDim, 'left');
      // Line 1 always opens "tide ↑" (the arrow alone when no highs), line 2 is indented under it.
      const up = `tide ↑${strips.highs.length ? ` ${strips.highs.join(' ')}` : ''}`;
      const down = strips.lows.length ? `     ↓ ${strips.lows.join(' ')}` : '';
      line(up, ty + tideH * 0.3);
      if (down) line(down, ty + tideH * 0.72);
      box = { x: x + w * 0.72, y: ty + 4, w: w * 0.24, h: tideH - 8 };
    } else {
      const ordered = [...tides].filter((t) => t && (t.kind === 'high' || t.kind === 'low')).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      ordered.slice(0, 4).forEach((t, i) => {
        const hgt = formatTideHeight(t.height);
        const str = `${i === 0 ? 'tide ' : '     '}${t.kind === 'high' ? '↑' : '↓'} ${t.time}${hgt ? ` ${hgt}` : ''}`;
        text(ctx, str, x + w * 0.1, ty + 10 + 14 * i, Math.max(floor, fitSize(ctx, str, floor, w * 0.8)), PALETTE.labelDim, 'left');
      });
      box = { x: x + w * 0.1, y: ty + tideH + 4, w: w * 0.8, h: curveH - 8 };
    }
    const c = tideCurve(tides, dayT);
    if (c) {
      const px = (t) => box.x + t * box.w;
      const py = (v) => box.y + box.h * (1 - 0.15 - 0.7 * ((v - c.min) / (c.max - c.min || 1)));
      ctx.lineWidth = 1;
      ctx.strokeStyle = css(PALETTE.glass, 0.6);
      ctx.beginPath();
      c.points.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.t), py(p.h)) : ctx.lineTo(px(p.t), py(p.h))));
      ctx.stroke();
      if (c.now) {
        ctx.fillStyle = css(PALETTE.labelInk);
        ctx.beginPath();
        ctx.arc(px(c.now.t), py(c.now.h), Math.max(1.5, box.h * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (sun) {
    // The sun's path under the strip: dim and dotless outside daylight.
    const day = Number.isFinite(sunT) && sunT >= 0 && sunT <= 1;
    const cx = x + w / 2;
    const rx = w * 0.42;
    const baseY = y + h + strip + tideH + curveH + arcH - 3;
    const ry = arcH - 6;
    ctx.beginPath();
    ctx.ellipse(cx, baseY, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = css(PALETTE.brass, day ? 0.55 : 0.3);
    ctx.stroke();
    if (day) {
      const a = Math.PI + sunT * Math.PI;
      ctx.fillStyle = css(PALETTE.sun);
      ctx.beginPath();
      ctx.arc(cx + rx * Math.cos(a), baseY + ry * Math.sin(a), Math.max(1.5, arcH * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
