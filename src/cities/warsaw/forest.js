// The near (Praga) bank of Warsaw's jar: a thin strip of pale river beach at the
// water, then the riverside forest in rows of rounded crowns, the far row small
// and hazed, the near ones large and dark. The crowns take the season's colours
// (seasonWeights / canopyColour in scene.js), carry a highlight on the sun's side
// that moves with the hour and a shade side under it, stand bare as branching
// silhouettes in winter, and hold two small warm path lamps after dark.
// Everything is built once, in px of the 340 x 396 reference box.
import { clamp } from '../../clock.js';
import { css, mix, glow, sheen } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { LABEL } from '../../jar-geometry.js';
import { WARSAW } from './palette.js';
import { QUAY_TOP, seasonWeights, canopyColour, tone } from './scene.js';

const BW = 340;
const BH = 396;
const PLATE_TOP = 292; // the label plate's top in the reference box (test/warsaw.test.js checks it)

export const BEACH = 5; // px of sand between the water and the first trees
export const FOREST = { first: 8.5, r0: 5, grow: 1.35, pitch: 1.1, gap: 1.5 };

// The rows, far to near: baseline y and crown radius, in reference px.
export const ROWS = (() => {
  const rows = [];
  let y = QUAY_TOP * BH + FOREST.first;
  let r = FOREST.r0;
  for (let j = 0; y - r < BH; j++) {
    rows.push({ j, y, r });
    y += r * FOREST.pitch;
    r += FOREST.grow;
  }
  return rows;
})();

// A crown is a clump, not a ball: a heart and three lobes, [dx, dy, r] in units of
// the crown's radius, a little different for every tree.
function lobesOf(seed) {
  const j = (n) => (hash2(seed, 270 + n) - 0.5) * 0.16;
  return [
    [0, 0, 0.74],
    [-0.5 + j(0), 0.2 + j(1), 0.5 + j(2)],
    [0.5 + j(3), 0.22 + j(4), 0.5 + j(5)],
    [j(6) * 2, -0.38 + j(7), 0.5 + j(8)],
  ];
}

// Every tree: centre and radius in reference px, its row, a colour column `k`
// (neighbours share a colour drift) and a seed. A crown wholly behind the label
// plate is never built.
export const TREES = (() => {
  const trees = [];
  for (const row of ROWS) {
    const step = row.r * FOREST.gap;
    const n = Math.ceil(BW / step) + 2;
    for (let i = 0; i < n; i++) {
      const s = row.j * 97 + i;
      const r = row.r * (0.85 + 0.35 * hash2(s, 201));
      const x = (i - 0.5) * step + (hash2(s, 202) - 0.5) * 0.5 * row.r + (row.j % 2) * step * 0.5;
      const y = row.y + (hash2(s, 203) - 0.5) * 0.4 * row.r;
      if (y - r > PLATE_TOP + 3 && x - r > LABEL.x + 2 && x + r < LABEL.x + LABEL.w - 2) continue;
      trees.push({ x, y, r, row: row.j, k: x / 7 + row.j * 5 + (hash2(s, 204) - 0.5) * 6, s, tone: hash2(s, 205), lobes: lobesOf(s) });
    }
  }
  return trees;
})();
const BY_ROW = ROWS.map((row) => TREES.filter((t) => t.row === row.j));

// Two lamps on the path through the trees: x, y shares of the body, clear of the label plate.
export const PATH_LAMPS = [{ x: 0.36, y: 0.722 }, { x: 0.915, y: 0.805 }];

// A bare tree's branches as [x0, y0, x1, y1] segments in units of its radius, from its seed.
export function branches(seed) {
  const out = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.12 + 0.76 * ((i + 0.5 * hash2(seed, 210 + i)) / n)); // fanned across the upper half
    const y0 = 0.35 - 0.11 * i;
    const len = 0.62 + 0.36 * hash2(seed, 220 + i);
    const x1 = Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len;
    out.push([0, y0, x1, y1]);
    // one twig off each branch, bending upward
    const mx = x1 * 0.55;
    const my = y0 + (y1 - y0) * 0.55;
    out.push([mx, my, mx + Math.cos(a - 0.7 * Math.sign(x1 || 1)) * len * 0.4, my + Math.sin(a - 0.7 * Math.sign(x1 || 1)) * len * 0.4 - 0.08]);
  }
  return out;
}
const BRANCHES = new Map();
const branchesOf = (seed) => {
  let b = BRANCHES.get(seed);
  if (!b) {
    b = branches(seed);
    BRANCHES.set(seed, b);
  }
  return b;
};

// Adds one crown's lobes to the current path.
function clump(ctx, x, y, r, lobes) {
  for (const [dx, dy, lr] of lobes) {
    ctx.moveTo(x + (dx + lr) * r, y + dy * r);
    ctx.arc(x + dx * r, y + dy * r, lr * r, 0, Math.PI * 2);
  }
}

// `sun` is scene.js's sunLight(): { x, golden, heavy }. Returns { lamps }.
export function drawNearBank(ctx, L, tint, night, weather, nowMs, sun) {
  const snow = weather && weather.kind === 'snow';
  const day = 1 - night;
  const bottom = L.oy + L.h;
  const X = (px) => L.ox + px * L.sx;
  const Y = (px) => L.oy + px * L.sy;
  const w = seasonWeights(nowMs);
  const leaf = 1 - (w.winter || 0);
  const bare = w.winter || 0;
  const shade = (c) => tone(c, WARSAW.treeDusk, WARSAW.treeNight, night);
  const far = (j) => 1 - j / (ROWS.length - 1);
  // depth: by day the far rows are simply less shaded; after dark they lift a little toward the sky, so the bank is never one black slab
  const hazed = (c, j) => mix(shade(c), tint.skyLow, 0.2 * far(j) * night);
  const snowC = mix(WARSAW.snowCap, WARSAW.treeNight, 0.5 * night + 0.05);

  // the beach: pale sand under the water's edge, a little uneven where the river laps it
  const beachC = snow ? snowC : tone(WARSAW.beachDay, WARSAW.beachDusk, WARSAW.beachNight, night);
  ctx.fillStyle = css(mix(beachC, tint.skyLow, 0.12));
  ctx.beginPath();
  ctx.moveTo(L.ox, L.quayTop + (BEACH + 6) * L.sy);
  for (let x = 0; x <= BW + 0.01; x += 10) ctx.lineTo(X(x), L.quayTop - (0.3 + 1.3 * hash2(Math.round(x / 10), 230)) * L.sy);
  ctx.lineTo(L.ox + L.w, L.quayTop + (BEACH + 6) * L.sy);
  ctx.closePath();
  ctx.fill();

  // where the sun's light falls on a crown: sideways with the hour, always from above
  const sdx = clamp((sun.x - 0.5) * 2.4, -1, 1);
  const lightC = mix(WARSAW.leafLight, WARSAW.leafGolden, sun.golden);
  const lightA = day * (0.13 + 0.07 * sun.golden) * (1 - 0.6 * sun.heavy);
  const twigC = shade(WARSAW.twig);

  ROWS.forEach((row, j) => {
    const trees = BY_ROW[j];
    const next = ROWS[j + 1];
    const y0 = Y(row.y);
    const y1 = next ? Y(next.y) + 1 : bottom;
    // the ground and the shade between the trunks: dark canopy in leaf, litter (or snow) in winter
    const underLeaf = mix(canopyColour(j * 9, w), WARSAW.leafShade, 0.35 + 0.2 * (1 - far(j)));
    const groundC = snow ? snowC : mix(underLeaf, mix(WARSAW.winterGround, WARSAW.leafShade, 0.35 * (1 - far(j))), bare);
    // snow under the trees lies in their shade: blue-grey, deeper toward the viewer, never a bright sheet
    ctx.fillStyle = css(snow ? mix(mix(snowC, WARSAW.iceShadow, 0.5 + 0.3 * (1 - far(j))), tint.skyLow, 0.1 * far(j)) : hazed(groundC, j));
    ctx.fillRect(L.ox, y0, L.w, y1 - y0);

    if (leaf > 0) {
      // each crown's shade side: its own shape in dark, dropped a little and pushed away from the sun
      ctx.fillStyle = css(hazed(underLeaf, j), leaf);
      ctx.beginPath();
      for (const t of trees) clump(ctx, X(t.x) - sdx * 0.12 * t.r * L.sx, Y(t.y) + 0.22 * t.r * L.sy, t.r * L.sx, t.lobes);
      ctx.fill();
      // the crowns, each its own colour from the season's range and a shade lighter or darker than its neighbour
      for (const t of trees) {
        const c = canopyColour(t.k, w);
        const own = t.tone < 0.5 ? mix(c, WARSAW.leafShade, (0.12 + 0.18 * (1 - far(j))) * (1 - 2 * t.tone)) : mix(c, WARSAW.leafLight, 0.12 * (2 * t.tone - 1));
        ctx.fillStyle = css(hazed(mix(own, WARSAW.leafShade, 0.26 * (1 - far(j))), j), leaf); // the near rows stand in deeper green
        ctx.beginPath();
        clump(ctx, X(t.x), Y(t.y), t.r * L.sx, t.lobes);
        ctx.fill();
      }
      // the light on their sun side: the top lobe and the shoulder that faces the sun
      if (lightA > 0) {
        ctx.fillStyle = css(lightC, lightA * leaf * (1 - 0.35 * far(j)));
        ctx.beginPath();
        for (const t of trees) {
          const r = t.r * L.sx;
          const [dx, dy] = t.lobes[3];
          const hx = X(t.x) + (dx + sdx * 0.2) * r;
          const hy = Y(t.y) + (dy - 0.06) * r;
          ctx.moveTo(hx + 0.36 * r, hy);
          ctx.arc(hx, hy, 0.36 * r, 0, Math.PI * 2);
          const sx2 = X(t.x) + sdx * 0.52 * r;
          const sy2 = Y(t.y) + 0.06 * r;
          ctx.moveTo(sx2 + 0.26 * r, sy2);
          ctx.arc(sx2, sy2, 0.26 * r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

    if (bare > 0) {
      // bare trees: a haze of fine twigs where the crown was, a trunk, and branches fanning up
      ctx.fillStyle = css(hazed(WARSAW.twig, j), 0.16 * bare);
      ctx.beginPath();
      for (const t of trees) {
        const r = t.r * L.sx;
        ctx.moveTo(X(t.x) + 0.85 * r, Y(t.y) - 0.2 * r);
        ctx.arc(X(t.x), Y(t.y) - 0.2 * r, 0.85 * r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = css(twigC, 0.9 * bare);
      for (const t of trees) {
        const r = t.r * L.sx;
        const tw = Math.max(0.7 * L.sx, 0.14 * r);
        ctx.fillRect(X(t.x) - tw / 2, Y(t.y) - 0.2 * r, tw, 1.1 * r);
      }
      ctx.strokeStyle = css(twigC, 0.85 * bare);
      ctx.lineWidth = (0.45 + 0.03 * row.r) * L.sx;
      ctx.beginPath();
      for (const t of trees) {
        const r = t.r * L.sx;
        for (const [ax, ay, bx, by] of branchesOf(t.s)) {
          ctx.moveTo(X(t.x) + ax * r, Y(t.y) + ay * r);
          ctx.lineTo(X(t.x) + bx * r, Y(t.y) + by * r);
        }
      }
      ctx.stroke();
    }

    if (snow) {
      // snow lying on the crowns (or along the upper branches)
      ctx.fillStyle = css(snowC, 0.85);
      ctx.beginPath();
      for (const t of trees) {
        const r = t.r * L.sx;
        const rx = (0.62 - 0.2 * bare) * r;
        ctx.moveTo(X(t.x) + rx, Y(t.y) - 0.6 * r);
        ctx.ellipse(X(t.x), Y(t.y) - 0.6 * r, rx, (0.24 - 0.1 * bare) * r, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  });

  // after dark, two small warm lamps on the path through the trees
  if (night > 0) {
    for (const p of PATH_LAMPS) {
      const x = L.ox + p.x * L.w;
      const y = L.oy + p.y * L.h;
      sheen(ctx, x, y + 2 * L.sy, 15 * L.sx, 6 * L.sy, WARSAW.pathLamp, 0.2 * night);
      ctx.fillStyle = css(WARSAW.pathPost);
      ctx.fillRect(x - 0.4 * L.sx, y - 6 * L.sy, 0.8 * L.sx, 6 * L.sy);
      glow(ctx, x, y - 6.5 * L.sy, 9 * L.sx, WARSAW.pathLamp, 0.5 * night);
      ctx.fillStyle = css(WARSAW.pathLamp, 0.95 * night);
      ctx.beginPath();
      ctx.arc(x, y - 6.5 * L.sy, 1.2 * L.sx, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return { lamps: night > 0 ? PATH_LAMPS.length : 0 };
}
