// The snow that lies on Fitz Roy's wall: ribbons down the gullies that widen into
// aprons, slanted slivers on the ledges, the saddle between Poincenot and Fitz Roy
// and the fingers of the glacier. Pure, canvas-free, built once from the rock's
// own ribs and the scene's hash, so the same wall always carries the same snow.
// A shape is { kind, poly, facing, hold, probe }: `facing` is the facing of the
// rock under it (the wall's light rule colours it), `hold` the snow amount it takes
// to show, `probe` a point inside it.
import { clamp } from '../../clock.js';

export function chainY(chain, x) {
  if (x <= chain[0][0]) return chain[0][1];
  for (let i = 1; i < chain.length; i++) {
    if (x <= chain[i][0]) {
      const [x0, y0] = chain[i - 1];
      const [x1, y1] = chain[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return chain[chain.length - 1][1];
}
export function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}
export function centroid(poly) {
  const n = poly.length;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}
export function bbox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
// the shapes that show at this snow amount (0..1)
export function visibleSnow(shapes, amount) {
  return shapes.filter((s) => s.hold <= amount);
}

const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// A point on a rib [top, mid, bottom]: a in 0..1 runs top to mid, 1..2 mid to bottom.
const along = (rib, a) => (a <= 1 ? lerpPt(rib[0], rib[1], a) : lerpPt(rib[1], rib[2], a - 1));
// The rib's x at height y.
function ribX(rib, y) {
  const [t, m, b] = rib;
  const seg = y <= m[1] ? [t, m] : [m, b];
  return seg[0][0] + ((seg[1][0] - seg[0][0]) * (y - seg[0][1])) / (seg[1][1] - seg[0][1] || 1);
}
const facingAt = (body, x, y) => {
  const f = body.facets.find((fc) => inside(fc.poly, x, y));
  return f ? f.facing : 0;
};

// Pull every point of a shape that sticks out of the outline sideways towards the
// anchor, and keep it above the foot; null when it cannot be brought in.
function fit(poly, outline, anchorX, floor) {
  const out = [];
  for (const [x0, y0] of poly) {
    const y = Math.min(y0, floor);
    let x = x0;
    for (let i = 0; i < 20 && !inside(outline, x, y); i++) x += Math.sign(anchorX - x) * Math.min(0.002, Math.abs(anchorX - x));
    if (!inside(outline, x, y)) return null;
    out.push([x, y]);
  }
  return out;
}
// keep a spot clear: shrink by a quarter towards the middle, up to three times, then drop
const NEAR = 0.006;
export const touches = (poly, [bx, by]) => [[0, 0], [NEAR, 0], [-NEAR, 0], [0, NEAR], [0, -NEAR]].some(([dx, dy]) => inside(poly, bx + dx, by + dy));
function keepBare(poly, bare) {
  let p = poly;
  for (let i = 0; i < 4; i++) {
    if (!bare.some((b) => touches(p, b))) return p;
    if (i === 3) return null;
    const [cx, cy] = centroid(p);
    p = p.map(([x, y]) => [cx + (x - cx) * 0.75, cy + (y - cy) * 0.75]);
  }
  return null;
}

// A shape through the three rules (into the outline, off the bare spots, into the
// outline again), with its probe and the facing of the rock under it; null when it fails.
function settle(body, kind, poly, anchorX, hold, probe, floor, extra = {}) {
  let p = fit(poly, body.outline, anchorX, floor);
  if (!p) return null;
  const moved = p.some((q, i) => q[0] !== poly[i][0] || q[1] !== poly[i][1]);
  p = keepBare(p, extra.bare || []);
  if (!p) return null;
  p = fit(p, body.outline, anchorX, floor);
  if (!p) return null;
  const pr = inside(p, probe[0], probe[1]) ? probe : centroid(p);
  if (!inside(p, pr[0], pr[1])) return null;
  const { bare, ...rest } = extra;
  return { kind, poly: p, facing: facingAt(body, pr[0], pr[1]), hold, probe: pr, ...rest, whole: !moved && p.length === poly.length && p.every((q, i) => q[0] === poly[i][0] && q[1] === poly[i][1]) };
}

// Does the box (grown by `pad`) touch the polygon: a corner of the polygon in the
// box, or a point of the box or of an edge of the polygon on the other side.
export function boxHitsPoly(b, poly, pad = 0) {
  const x0 = b.x0 - pad;
  const x1 = b.x1 + pad;
  const y0 = b.y0 - pad;
  const y1 = b.y1 + pad;
  const within = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const c = poly[(i + 1) % poly.length];
    for (let t = 0; t <= 1; t += 0.1) if (within(lerpPt(a, c, t))) return true;
  }
  const probes = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) probes.push([x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * j) / 4]);
  return probes.some(([x, y]) => inside(poly, x, y));
}

// What stands in front of the wall at x: the hanging glacier's upper margin where
// there is one, the moraine's crest elsewhere. Snow that must be seen ends above it.
export function occlusion(margin, x, crest = 0.4) {
  return x >= margin[0][0] && x <= margin[margin.length - 1][0] ? chainY(margin, x) : crest;
}

// One ribbon down a gully: it starts as a thread, bends a little with the rock and
// flares into a cone whose lower edge is ragged. `cx(y)` is its centre line, `hw0`
// the half-width at the top, `hwEnd` at the foot.
function ribbon(cx, y0, y1, hw0, hwEnd, bend, hh, key) {
  const fs = [0, 0.25, 0.5, 0.75, 0.9, 1];
  const at = (f) => {
    const y = y0 + (y1 - y0) * f;
    return [cx(y) + bend * Math.sin(Math.PI * f), y, hw0 + hwEnd * Math.pow(f, 1.9)];
  };
  const pts = fs.map(at);
  const left = pts.map(([x, y, hw]) => [x - hw, y]);
  const right = pts.map(([x, y, hw]) => [x + hw, y]);
  const l = left[left.length - 1];
  const r = right[right.length - 1];
  const foot = [0.2, 0.4, 0.6, 0.8].map((f, q) => [l[0] + (r[0] - l[0]) * f + (hh(key + q, 16) - 0.5) * 0.006, y1 + 0.006 * hh(key + q, 17)]);
  return { poly: [...left, ...foot, ...right.slice().reverse()], probe: [at(0.9)[0], at(0.9)[1]] };
}

// The snow on one rock body, ordered skirts, gullies, ledges. `k` offsets the hash;
// `occl(x)` is the height of whatever stands in front of the wall at x.
export function buildSnow(body, hh, k, bare = [], occl = () => 0.4) {
  const n = body.outline.length;
  const ridge = body.outline.slice(0, -2);
  const xmax = body.outline[n - 2][0];
  const xmin = body.outline[n - 1][0];
  const floor = body.outline[n - 1][1] - 0.012;
  const skirts = [];
  const gullies = [];
  const ledges = [];
  // the ribs bound the pillars; a pillar's left and right edge at height y
  const edges = [() => xmin, ...body.ridges.map((rib) => (y) => ribX(rib, y)), () => xmax];
  const pillar = (p, y) => [edges[p](y), edges[p + 1](y)];
  // the foot of a ribbon: just above what stands in front of the wall
  const lowest = (x, hw) => Math.min(...[-1, -0.5, 0, 0.5, 1].map((f) => occl(x + f * (hw + 0.008))));
  const footOf = (cx, y, hw) => { let y1 = lowest(cx(y), hw) - 0.016; y1 = lowest(cx(y1), hw) - 0.016; return y1; };
  const lay = (kind, cx, y0, hw0, hwEnd, hold, key, extra = {}) => {
    const y1 = footOf(cx, y0 + 0.1, hwEnd);
    if (y1 - y0 < 0.05) return null;
    const bend = (hh(key, k + 4) - 0.5) * 0.008;
    const r = ribbon(cx, y0, y1, hw0, hwEnd, bend, hh, key);
    return { r, y1, shape: settle(body, kind, r.poly, cx(y1), hold, r.probe, floor, { bare, ...extra }) };
  };
  // the gullies of the cracks: from a start that differs rib to rib, down to the cone
  body.couloirs.forEach((_, ci) => {
    const j = body.couloirRibs[ci];
    const rib = body.ridges[j - 1];
    const cx = (y) => ribX(rib, y);
    const y0 = rib[0][1] + (rib[1][1] - rib[0][1]) * (0.05 + 0.3 * hh(j, k + 3));
    const hwEnd = 0.012 + 0.006 * hh(j, k + 1);
    const main = lay('gully', cx, y0, 0.0015, hwEnd, 0, j * 10, { rib: j });
    if (!main) return;
    if (main.shape) gullies.push(main.shape);
    // the apron round the visible cone, there when there is more snow
    const ys = y0 + (main.y1 - y0) * 0.5;
    const ap = lay('skirt', cx, ys, 0.004, hwEnd * 1.7, 0.55, j * 10 + 3, { rib: j });
    if (ap && ap.shape) skirts.push(ap.shape);
  });
  // short ribbons in the minor gullies, between the cracks, in the deep of winter
  for (let p = 0; p < edges.length - 1; p++) {
    const cx = (y) => { const [l, r] = pillar(p, y); return l + 0.25 * (r - l); };
    const y0 = chainY(ridge, cx(0.3)) + 0.035 + 0.03 * hh(p, k + 6);
    const m = lay('gully', cx, y0, 0.0012, 0.009 + 0.004 * hh(p, k + 7), 0.7, 100 + p * 10, { rib: -1 - p });
    if (m && m.shape) gullies.push(m.shape);
  }
  // slivers on the ledges, on the rock between the ribbons: slanted, flat on top and uneven underneath
  const ribbons = [...skirts, ...gullies].map((sn) => sn.poly);
  const holds = [0, 0.35, 0, 0.85];
  for (let p = 0; p < edges.length - 1; p++) {
    const xm = (pillar(p, 0.3)[0] + pillar(p, 0.3)[1]) / 2;
    const yTop = chainY(ridge, xm) + 0.03;
    const yVis = occl(xm) - 0.02;
    if (yVis - yTop < 0.05) continue;
    [0.12, 0.28, 0.44, 0.6].forEach((q, qi) => {
      const key = p * 4 + qi;
      const cy = yTop + (yVis - yTop) * (q + (hh(key, k + 12) - 0.5) * 0.1);
      const [l, r] = pillar(p, cy);
      const w = clamp(0.4 * (r - l), 0.013, 0.024);
      const cx = l + 0.62 * (r - l);
      const sl = (hh(key, k + 14) < 0.5 ? -1 : 1) * (0.09 + 0.06 * hh(key, k + 13));
      const th = 0.0022 + 0.0008 * hh(key, k + 15);
      const L = [cx - w / 2, cy - (sl * w) / 2];
      const R = [cx + w / 2, cy + (sl * w) / 2];
      const poly = [L, R, [R[0] - 0.0015, R[1] + th * 0.6], [cx + w * 0.15, cy + th + 0.0012], [cx - w * 0.2, cy + th * 0.55], [L[0] + 0.001, L[1] + th * 0.8]];
      const sn = settle(body, 'ledge', poly, cx, holds[qi], [cx, cy + th * 0.4], floor, { bare, rib: -100 - key });
      if (!sn) return;
      const b = bbox(sn.poly);
      if (b.x1 - b.x0 < 2.5 * (b.y1 - b.y0)) return;
      if (ribbons.some((o) => boxHitsPoly(b, o, 0.002))) return;
      ledges.push(sn);
    });
  }
  // the last word on the bare spots, after every shift and shrink
  return [...skirts, ...gullies, ...ledges].filter((sn) => !bare.some((b) => touches(sn.poly, b))).map((sn) => { delete sn.whole; return sn; });
}

// The glacier's fingers: the glacier's upper margin runs up into the gully of each
// needle it reaches, wide where it joins the ice and tapering up the rock. The
// gully (and its apron) leave the needle for it. Returns the fingers; each body's
// `snow` is changed in place.
export function glacierFingers(bodies, glacierTop, bare = []) {
  const x0 = glacierTop[0][0];
  const x1 = glacierTop[glacierTop.length - 1][0];
  const line = (x) => chainY(glacierTop, x) + 0.012;
  const fingers = [];
  for (const body of bodies) {
    const floor = body.outline[body.outline.length - 1][1] - 0.012;
    body.couloirRibs.forEach((j) => {
      const rib = body.ridges[j - 1];
      if (rib[0][0] < x0 || rib[0][0] > x1) return;
      const bend = Math.sin(rib[0][0] * 531) * 0.006;
      const y0 = rib[0][1] + (rib[1][1] - rib[0][1]) * 0.1;
      const cx0 = (y) => ribX(rib, y) + bend * clamp((y - y0) / 0.12);
      let y1 = line(cx0(0.36));
      y1 = line(cx0(y1));
      if (y1 - y0 < 0.08) return;
      const fs = [0, 0.3, 0.6, 0.85, 1];
      const mid = fs.map((f) => { const y = y0 + (y1 - y0) * f; return [cx0(y), y, 0.002 + 0.017 * Math.pow(f, 1.3)]; });
      const left = mid.map(([x, y, hw]) => [x - hw, y]);
      const right = mid.map(([x, y, hw]) => [x + hw, y]);
      left[4][1] = line(left[4][0]);
      right[4][1] = line(right[4][0]);
      const onLine = [0.25, 0.5, 0.75].map((f) => { const x = left[4][0] + (right[4][0] - left[4][0]) * f; return [x, line(x)]; });
      const poly = fit([...left, ...onLine, ...right.slice().reverse()], body.outline, mid[4][0], floor);
      if (!poly) return;
      const probe = [mid[2][0], mid[2][1]];
      if (!inside(poly, probe[0], probe[1]) || bare.some((b) => touches(poly, b))) return;
      const finger = { kind: 'finger', poly, facing: facingAt(body, probe[0], probe[1]), hold: 0, probe, rib: j };
      body.snow = body.snow.filter((s) => s.rib !== j).concat(finger);
      fingers.push(finger);
    });
  }
  return fingers;
}

// The saddle between two peaks: a strip that follows the shared skyline, lowered a
// little, with a ragged lower edge, split at the col so that each half belongs to
// the peak it lies on. `skyline(x)` is the visible ridge height, `col` its lowest
// point, `bodies` the [left, right] rock bodies, `edge(i)` a hash in 0..1.
export function buildSaddle(skyline, col, xs, bodies, edge, bare = []) {
  const top = xs.map((x) => [x, skyline(x) + 0.005]);
  const bottom = xs.map((x, i) => [x, top[i][1] + 0.04 + 0.022 * clamp(1 - Math.abs(x - col[0]) / 0.03) + (edge(i) - 0.5) * 0.01]);
  const halves = [
    [top.filter((p) => p[0] <= col[0]), bottom.filter((p) => p[0] <= col[0]), bodies[0]],
    [top.filter((p) => p[0] >= col[0]), bottom.filter((p) => p[0] >= col[0]), bodies[1]],
  ];
  return halves.map(([t, b, body]) => {
    const poly = [...t, ...b.slice().reverse()];
    const floor = body.outline[body.outline.length - 1][1] - 0.012;
    let p = fit(poly, body.outline, col[0], floor);
    p = p && keepBare(p, bare);
    p = p && fit(p, body.outline, col[0], floor);
    if (!p || bare.some((b) => touches(p, b))) return null;
    const c = centroid(p);
    const pr = inside(p, c[0], c[1]) ? c : p[0];
    return { kind: 'saddle', poly: p, facing: facingAt(body, c[0], c[1]), hold: 0, probe: pr };
  });
}
