// Lantern's forecast card: a dark plate with a brass edge (as the label's),
// five days of icon, high and low in monospace, and the seven weather glyphs.
// Colours only from PALETTE, text only through text().
import { PALETTE, css } from './palette.js';
import { text } from './draw.js';
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

// The card on `rect`: `cells` is five { day, kind, high, low }; `layout` is
// 'column' (five rows) or 'row' (five columns). A cell with `today` gets a
// brass band and a brighter day name; `sun` ({ sunrise, sunset } or null) adds
// one strip along the bottom edge.
export function forecastCard(ctx, rect, cells, layout, sun = null) {
  const { x, y, w } = rect;
  const strip = sun ? CARD.strip[layout === 'row' ? 'row' : 'column'] : 0;
  const h = rect.h - strip;
  ctx.save();
  ctx.fillStyle = css(PALETTE.plate, 0.88);
  ctx.beginPath();
  ctx.roundRect(x, y, w, rect.h, 5);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(PALETTE.brass, 0.85);
  ctx.stroke();
  const n = cells.length || 1;
  if (layout === 'row') {
    const cw = w / n;
    cells.forEach((c, i) => {
      const cx = x + cw * (i + 0.5);
      if (c.today) {
        ctx.fillStyle = css(PALETTE.brass, 0.12);
        ctx.fillRect(x + cw * i, y, cw, h);
      }
      text(ctx, c.day, cx, y + h * 0.14, h * 0.13, c.today ? PALETTE.labelInk : PALETTE.labelDim);
      weatherIcon(ctx, c.kind, cx, y + h * 0.43, Math.min(cw * 0.7, h * 0.34));
      text(ctx, c.high, cx, y + h * 0.69, h * 0.15, PALETTE.labelInk);
      text(ctx, c.low, cx, y + h * 0.88, h * 0.13, PALETTE.labelDim);
    });
  } else {
    const rh = h / n;
    cells.forEach((c, i) => {
      const cy = y + rh * (i + 0.5);
      if (c.today) {
        ctx.fillStyle = css(PALETTE.brass, 0.12);
        ctx.fillRect(x, y + rh * i, w, rh);
      }
      text(ctx, c.day, x + w * 0.1, cy, rh * 0.26, c.today ? PALETTE.labelInk : PALETTE.labelDim, 'left');
      weatherIcon(ctx, c.kind, x + w * 0.45, cy, rh * 0.44);
      text(ctx, c.high, x + w * 0.73, cy, rh * 0.26, PALETTE.labelInk, 'right');
      text(ctx, c.low, x + w * 0.95, cy, rh * 0.22, PALETTE.labelDim, 'right');
    });
  }
  if (sun) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = css(PALETTE.brass, 0.35);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h);
    ctx.lineTo(x + w * 0.92, y + h);
    ctx.stroke();
    text(ctx, `↑ ${sun.sunrise}  ↓ ${sun.sunset}`, x + w / 2, y + h + strip * 0.5, strip * 0.48, PALETTE.labelDim);
  }
  ctx.restore();
}
