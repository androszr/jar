// El Chalten in a jar: Fitz Roy seen from the east shore of Laguna de los Tres,
// looking west. Back to front: the southern sky (air.js), the far ridge, the
// needles, Poincenot and Fitz Roy, the hanging glacier on its bench, the moraine,
// the clouds the wind makes and the cloud deck (air.js), the lake (water.js) and
// the shore (shore.js). The rock is built once from a
// fixed seed (buildPlates) as faceted granite, then shaded each frame by the
// hour. Shapes are shares of the jar body: x of its width, y of its height.
// Every mover is a function of `nowMs` or `phase`, so the same moment draws the
// same pixels.
import { LAMP_THRESHOLD, clamp } from '../../clock.js';
import { css, mix } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { EL_CHALTEN as EC } from './palette.js';
import {
  GLOW_TOP, GLOW_FOOT, visibilityBand, windOf, coverOf, plumeSide, mirrorAmount, glowLine, glowStrength, glowAt,
  silhouetteAmount, monthAt, seasonOf, freshSnow, facetShade, moonLight,
} from './massif.js';

export const SEED = 0xf172;
// the lake's far shore, and the gravel shore below it
export const SHORE = 0.5;
// (the near ground starts above the label plate, so the hiker is in view; it is a
// narrow, stony lip of moraine, not a beach: the lake runs almost to the viewer's feet)
export const GRAVEL = { y0: 0.672, y1: 0.737 };
export const BIVOUAC = { x: 0.57, y: 0.25 };
// where the headlamps wait on the shore, first lit first
export const LAMPS = [[0.16, 0.69], [0.31, 0.692], [0.46, 0.7], [0.8, 0.694], [0.24, 0.698], [0.53, 0.691], [0.88, 0.692]];
// the hiker's rock, clear of both glass streaks (the look's STREAKS)
export const ROCK = { x0: 0.6, x1: 0.74, y: 0.65, h: 0.04 };
// The x bands the glass streaks occupy (shares of the width); the look's STREAKS.
export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));

export function layout(w, h, ox = 0, oy = 0) {
  return { w, h, ox, oy, X: (s) => ox + s * w, Y: (s) => oy + s * h };
}

// ---- the geometry, built once ------------------------------------------------
// Every point is a share of the jar body. The wall is the subject: it stands from
// just under the neck of the glass down to the hanging glacier at its foot, and
// the moraine in front of it is kept low, so two thirds of the granite shows.
// Fitz Roy's tip, the highest point of the skyline below
export const SUMMIT = { x: 0.566, y: 0.085 };
const hh = (i, k) => hash2(i, SEED + k);
const chainY = (chain, x) => {
  if (x <= chain[0][0]) return chain[0][1];
  for (let i = 1; i < chain.length; i++) {
    if (x <= chain[i][0]) {
      const [x0, y0] = chain[i - 1];
      const [x1, y1] = chain[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return chain[chain.length - 1][1];
};
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// The skylines, left to right. Fitz Roy is the dominant tower: a steep clean south
// edge, the summit, and a north shoulder stepping down; Poincenot is the blade
// beside it; Val Biois, Mermoz and Guillaumet step down to the north (right), and
// the Aguja de la S, Saint-Exupery and Rafael Juarez stand to the south (left).
const FITZ = [[0.452, 0.335], [0.459, 0.288], [0.469, 0.24], [0.48, 0.196], [0.494, 0.156], [0.51, 0.128], [0.528, 0.108], [0.55, 0.094], [SUMMIT.x, SUMMIT.y],
  [0.577, 0.093], [0.587, 0.112], [0.6, 0.118], [0.611, 0.136], [0.618, 0.166], [0.632, 0.17], [0.644, 0.184], [0.652, 0.214], [0.662, 0.24], [0.676, 0.254], [0.69, 0.27], [0.705, 0.29]];
const POINCENOT = [[0.335, 0.345], [0.345, 0.3], [0.357, 0.26], [0.372, 0.215], [0.388, 0.18], [0.402, 0.16], [0.412, 0.165], [0.42, 0.19], [0.428, 0.225], [0.44, 0.25], [0.452, 0.262], [0.462, 0.3], [0.468, 0.335]];
const NEEDLES = [
  [[0.69, 0.3], [0.7, 0.262], [0.712, 0.238], [0.722, 0.232], [0.732, 0.246], [0.742, 0.272], [0.752, 0.3]],
  [[0.742, 0.3], [0.752, 0.262], [0.766, 0.232], [0.782, 0.214], [0.798, 0.218], [0.812, 0.24], [0.826, 0.265], [0.838, 0.3]],
  [[0.826, 0.3], [0.84, 0.268], [0.858, 0.25], [0.874, 0.244], [0.892, 0.258], [0.915, 0.285], [0.95, 0.308], [1, 0.325], [1.04, 0.335]],
];
const SOUTH = [
  [[0.15, 0.37], [0.166, 0.345], [0.184, 0.326], [0.196, 0.322], [0.208, 0.334], [0.226, 0.352]],
  [[0.212, 0.35], [0.226, 0.3], [0.242, 0.258], [0.256, 0.236], [0.268, 0.244], [0.28, 0.278], [0.296, 0.315]],
  [[0.288, 0.335], [0.3, 0.3], [0.312, 0.272], [0.322, 0.262], [0.331, 0.27], [0.342, 0.3], [0.356, 0.33]],
];
const FAR_RIDGE = [[-0.04, 0.4], [0, 0.368], [0.035, 0.352], [0.07, 0.328], [0.095, 0.334], [0.12, 0.356], [0.15, 0.366], [0.2, 0.372], [0.26, 0.38], [0.36, 0.392]];

// A rock body: the ridgeline split into vertical pillars whose shared edges lean,
// each pillar cut in two by a broken ledge line, so the body is `2 * slabs` planes.
// A plane faces a little left (-1, the south, in shade) or right (1, the north, in
// the sun): the flanks follow the side of the summit they stand on, and the pillars
// near the summit alternate, which is what makes the tower read as fluted granite.
// Ridges, cracks with a snow sliver lodged on a ledge, and a vertical grain sit on top.
function rockBody(ridge, slabs, k, grain, base = SHORE) {
  const n = ridge.length - 1;
  const idx = Array.from({ length: slabs + 1 }, (_, j) => Math.round((j * n) / slabs));
  let top = ridge[0];
  for (const r of ridge) if (r[1] < top[1]) top = r;
  const xmin = ridge[0][0];
  const xmax = ridge[n][0];
  const half = Math.max(top[0] - xmin, xmax - top[0], 0.02);
  const bot = idx.map((i, j) => [j === 0 || j === slabs ? ridge[i][0] : ridge[i][0] + (hh(j, k) - 0.5) * 0.05, base]);
  const mid = idx.map((i, j) => {
    const r = ridge[i];
    return [(r[0] + bot[j][0]) / 2 + (j === 0 || j === slabs ? 0 : (hh(j, k + 9) - 0.5) * 0.02), r[1] + (base - r[1]) * (0.42 + 0.2 * hh(j, k + 5))];
  });
  const facets = [];
  const ridges = [];
  const couloirs = [];
  const streaks = [];
  for (let j = 0; j < slabs; j++) {
    const run = ridge.slice(idx[j], idx[j + 1] + 1);
    const cx = run.reduce((s, p) => s + p[0], 0) / run.length;
    const side = clamp(((cx - top[0]) / half) * 1.4, -1, 1);
    const f = clamp(side + (j % 2 === 0 ? 0.5 : -0.5) * (1 - Math.abs(side)) + (hh(j, k + 2) - 0.5) * 0.2, -1, 1);
    facets.push({ poly: [...run, mid[j + 1], mid[j]], facing: f });
    facets.push({ poly: [mid[j], mid[j + 1], bot[j + 1], bot[j]], facing: clamp(f + (hh(j, k + 3) - 0.5) * 0.5, -1, 1) });
  }
  for (let j = 1; j < slabs; j++) {
    const t = ridge[idx[j]];
    ridges.push([t, mid[j], bot[j]]);
    // snow lodged on a ledge part-way down the rib, not hanging from the crest
    const s = 0.3 + 0.35 * hh(j, k + 11);
    const q = [t[0] + (mid[j][0] - t[0]) * s, t[1] + (mid[j][1] - t[1]) * s];
    streaks.push([[q[0] - 0.008, q[1] + 0.001], [q[0] - 0.001, q[1] - 0.002], [q[0] + 0.008, q[1]], [q[0] + 0.003, q[1] + 0.0028], [q[0] - 0.004, q[1] + 0.003]]);
    // a crack: a thin dark wedge from the notch down the pillar's edge
    if (j % 2 === 1) couloirs.push([[t[0], t[1] + 0.008], [mid[j][0] + 0.0045, mid[j][1]], [mid[j][0] - 0.0045, mid[j][1]]]);
  }
  const g = [];
  for (let i = 0; i < grain; i++) {
    const x = xmin + (xmax - xmin) * hh(i, k + 20);
    const y = chainY(ridge, x) + 0.012;
    const len = 0.025 + 0.06 * hh(i, k + 30);
    const y0 = y + Math.max(0, base - y - len - 0.01) * hh(i, k + 40) * 0.6;
    g.push([[x, y0], [x + (hh(i, k + 50) - 0.5) * 0.006, y0 + len]]);
  }
  return { outline: [...ridge, [xmax, base], [xmin, base]], facets, ridges, couloirs, streaks, grain: g, ledge: mid };
}

// The night sky's own things: a band of the Milky Way (soft cloud and star dust
// along a line that climbs to the right) and the Southern Cross lying in it, with
// its two pointers low on the left.
function buildSky() {
  const A = [-0.02, 0.27];
  const B = [0.72, -0.02];
  const nx = -(B[1] - A[1]);
  const ny = B[0] - A[0];
  const at = (t, off) => [A[0] + (B[0] - A[0]) * t + nx * off, A[1] + (B[1] - A[1]) * t + ny * off];
  return {
    clouds: Array.from({ length: 9 }, (_, i) => { const [x, y] = at((i + 0.5) / 9, (hh(i, 120) - 0.5) * 0.12); return { x, y, r: 0.075 + 0.05 * hh(i, 121), a: 0.5 + 0.5 * hh(i, 122) }; }),
    dust: Array.from({ length: 96 }, (_, i) => {
      const [x, y] = at(hh(i, 123), (hh(i, 124) + hh(i, 125) - 1) * 0.16);
      return { x, y, r: 0.35 + 0.5 * hh(i, 126), a: 0.25 + 0.5 * hh(i, 127) };
    }),
  };
}

export function buildPlates(w, h) {
  // Poincenot (the blade), Fitz Roy (the tower), the needles stepping down to the
  // north, and the three to the south, a little further off
  const bodies = {
    poincenot: rockBody(POINCENOT, 4, 100, 40),
    fitzroy: rockBody(FITZ, 8, 200, 64),
    needles: NEEDLES.map((r, i) => rockBody(r, 2, 300 + i * 10, 12)),
    south: SOUTH.map((r, i) => rockBody(r, 2, 500 + i * 10, 6)),
  };
  const far = rockBody(FAR_RIDGE, 3, 400, 0);
  // the snow that lies on the wall: the apron at Poincenot's foot, the shelf under
  // Fitz Roy's north shoulder, and one hanging patch on the face; then the caps
  const snowfields = [
    [[0.355, 0.376], [0.37, 0.36], [0.384, 0.342], [0.394, 0.336], [0.404, 0.346], [0.416, 0.36], [0.43, 0.374]],
    [[0.6, 0.366], [0.62, 0.348], [0.64, 0.33], [0.654, 0.318], [0.664, 0.312], [0.672, 0.326], [0.678, 0.345], [0.682, 0.358], [0.65, 0.364]],
    [[0.528, 0.222], [0.545, 0.212], [0.562, 0.214], [0.553, 0.226], [0.538, 0.23]],
  ];
  const caps = [
    [[0.553, 0.093], [SUMMIT.x, SUMMIT.y], [0.576, 0.0925], [0.57, 0.099], [0.558, 0.1]],
    [[0.62, 0.167], [0.632, 0.17], [0.643, 0.183], [0.632, 0.178]],
    [[0.776, 0.2175], [0.782, 0.214], [0.797, 0.2185], [0.788, 0.225]],
  ];
  // the hanging glacier at the foot of the wall: its upper margin runs up into the
  // gullies, its front is an ice cliff standing over a bench of dark slabs
  const margin = [[0.4, 0.384], [0.43, 0.372], [0.455, 0.362], [0.47, 0.358], [0.482, 0.366], [0.51, 0.374], [0.54, 0.37], [0.575, 0.366], [0.61, 0.37], [0.65, 0.366], [0.685, 0.354],
    [0.7, 0.332], [0.714, 0.352], [0.745, 0.356], [0.78, 0.35], [0.82, 0.342], [0.86, 0.34], [0.9, 0.345], [0.94, 0.352]];
  // (the north end is no cliff: a ramp of snow running up under the needles)
  const front = [[0.4, 0.384], [0.408, 0.404], [0.43, 0.418], [0.47, 0.424], [0.52, 0.422], [0.56, 0.43], [0.62, 0.428], [0.67, 0.434], [0.73, 0.428], [0.78, 0.424], [0.82, 0.408], [0.87, 0.386], [0.91, 0.368], [0.94, 0.352]];
  // the cliff: the front again, finer, dropped by a height that breaks into seracs
  const brow = [];
  for (let i = 0; i <= 32; i++) {
    const x = 0.408 + (0.412 * i) / 32;
    brow.push([x, chainY(front, x) + (i % 2 ? 0.0025 : 0) * hh(i, 60)]);
  }
  const toe = brow.map(([x, y], i) => [x, y + (i === 0 || i === 32 ? 0 : (0.011 + 0.012 * hh(i >> 1, 61) + (i % 2 ? 0.003 : 0)) * Math.min(1, i / 3, (32 - i) / 3))]);
  // crevasses follow the flow, opening towards the cliff
  const crevasses = [0, 1, 2, 3, 4, 5].map((i) => {
    const x = 0.5 + 0.052 * i + 0.02 * hh(i, 62);
    const yt = chainY(margin, x) + 0.006;
    const yb = chainY(front, x) - 0.004;
    const lean = (hh(i, 63) - 0.7) * 0.02;
    return [[x - lean, yt + (yb - yt) * (0.2 + 0.3 * hh(i, 64))], [x - lean * 0.4, yt + (yb - yt) * 0.7], [x, yb]];
  });
  const glacier = {
    outline: [...margin, ...front.slice().reverse()],
    front, brow,
    cliff: [...brow, ...toe.slice().reverse()],
    // the ice's own shadow sides: the south end, and a step half-way down the flow
    shades: [
      [[0.4, 0.384], [0.43, 0.372], [0.455, 0.362], [0.475, 0.39], [0.5, 0.41], [0.47, 0.424], [0.43, 0.418], [0.408, 0.404]],
      [[0.585, 0.402], [0.66, 0.398], [0.73, 0.39], [0.775, 0.382], [0.785, 0.39], [0.74, 0.402], [0.66, 0.41], [0.59, 0.412]],
      [[0.8, 0.372], [0.86, 0.356], [0.92, 0.35], [0.94, 0.352], [0.91, 0.368], [0.87, 0.385], [0.83, 0.4]],
    ],
    crevasses,
    seracs: brow.filter((_, i) => i % 3 === 1).map(([x, y], i) => [[x, y + 0.002], [x + 0.001, y + 0.008 + 0.006 * hh(i, 65)]]),
    // the slabs the ice hangs over, three planes of them in the light, and the meltwater down them
    bench: [[0.355, 0.5], [0.372, 0.44], [0.39, 0.404], [0.4, 0.384], [0.94, 0.352], [1.04, 0.36], [1.04, 0.5]],
    benchLit: [
      [[0.47, 0.434], [0.55, 0.447], [0.57, 0.47], [0.5, 0.464]],
      [[0.63, 0.456], [0.71, 0.452], [0.73, 0.47], [0.65, 0.478]],
      [[0.8, 0.44], [0.88, 0.428], [0.9, 0.45], [0.82, 0.46]],
      [[0.86, 0.402], [0.93, 0.394], [1.0, 0.398], [0.97, 0.416], [0.89, 0.42]],
    ],
    melt: [[0.6, 0.45], [0.6, 0.466], [0.594, 0.482], [0.59, 0.5]],
  };
  // the moraine: a low brown hill on the left and the slope under the bench on the
  // right, both well below the wall; scree on it, and the snow patches of the season
  const moraine = [[-0.04, 0.5], [-0.04, 0.452], [0, 0.44], [0.05, 0.422], [0.1, 0.408], [0.15, 0.4], [0.19, 0.398], [0.23, 0.405], [0.27, 0.418], [0.31, 0.412], [0.345, 0.405], [0.38, 0.412],
    [0.41, 0.428], [0.44, 0.445], [0.47, 0.462], [0.5, 0.478], [0.53, 0.492], [0.55, 0.5]];
  const slope = [[0.6, 0.5], [0.66, 0.488], [0.74, 0.478], [0.82, 0.468], [0.9, 0.458], [0.98, 0.448], [1.04, 0.44], [1.04, 0.5]];
  const scree = [];
  for (let i = 0; i < 500 && scree.length < 60; i++) {
    const x = -0.04 + 1.08 * hh(i, 70);
    const y = 0.4 + (SHORE - 0.4) * hh(i, 71);
    if (inside(moraine, x, y) || inside(slope, x, y)) scree.push({ x, y, r: 0.0025 + 0.004 * hh(i, 72), shade: hh(i, 73) });
  }
  return {
    w, h, ...bodies, far, snowfields, caps, glacier,
    moraine: {
      outline: moraine,
      shade: [[-0.04, 0.5], [-0.04, 0.452], [0, 0.44], [0.05, 0.422], [0.08, 0.448], [0.05, 0.475], [0.02, 0.5]],
      slope,
      // the hill's own planes: sunlit shoulders, a shaded gully face, a band of dark rock, the scree apron at its foot
      planes: [
        { kind: 'lit', poly: [[0.05, 0.422], [0.1, 0.408], [0.15, 0.4], [0.19, 0.398], [0.2, 0.44], [0.14, 0.455], [0.08, 0.448]] },
        { kind: 'dark', poly: [[0.19, 0.398], [0.23, 0.405], [0.27, 0.418], [0.262, 0.458], [0.2, 0.44]] },
        { kind: 'rock', poly: [[0.27, 0.418], [0.31, 0.412], [0.345, 0.405], [0.36, 0.45], [0.31, 0.47], [0.262, 0.458]] },
        { kind: 'lit', poly: [[0.345, 0.405], [0.38, 0.412], [0.41, 0.428], [0.44, 0.445], [0.47, 0.462], [0.44, 0.478], [0.36, 0.45]] },
        { kind: 'lit', poly: [[0.74, 0.478], [0.82, 0.468], [0.9, 0.458], [0.98, 0.448], [1.04, 0.44], [1.04, 0.468], [0.9, 0.48], [0.78, 0.49]] },
        { kind: 'apron', poly: [[0, 0.5], [0.06, 0.478], [0.16, 0.468], [0.3, 0.476], [0.44, 0.478], [0.5, 0.478], [0.53, 0.492], [0.55, 0.5]] },
      ],
      scree,
      patches: [[[0.12, 0.406], [0.16, 0.4], [0.185, 0.41], [0.15, 0.418]], [[0.3, 0.416], [0.33, 0.409], [0.352, 0.42], [0.325, 0.428]], [[0.84, 0.47], [0.9, 0.46], [0.94, 0.462], [0.88, 0.474]]],
    },
    // where the wind lifts snow off the ridges, strongest first
    spindrift: [[0.402, 0.16], [0.634, 0.152], [0.782, 0.214], [0.258, 0.243], [0.874, 0.244], [0.722, 0.232]],
    shore: buildShore(),
    lamps: LAMPS,
    sky: buildSky(),
    // the Southern Cross (Gacrux, Acrux, Mimosa, Delta, and little Epsilon last) and its pointers
    cross: { stars: [[0.262, 0.098], [0.238, 0.172], [0.222, 0.128], [0.275, 0.132], [0.252, 0.147]], pointers: [[0.105, 0.215], [0.15, 0.196]] },
  };
}

// The near ground: a broken waterline, boulders standing in it and behind the
// people, low stones where they walk, and big blocks in the foreground. Each
// boulder is a faceted block: a body, and an upper plane that takes the light.
export const SHORE_JAG = 0.014;
function boulder(cx, base, w, h, k) {
  const poly = [[cx - w * 0.5, base], [cx - w * 0.43, base - h * (0.5 + 0.25 * hh(k, 91))], [cx - w * 0.14, base - h],
    [cx + w * (0.18 + 0.12 * hh(k, 92)), base - h * 0.9], [cx + w * 0.47, base - h * (0.3 + 0.2 * hh(k, 94))], [cx + w * 0.52, base]];
  const heart = [cx + w * 0.04, base - h * 0.5];
  // the top plane takes the light; the face turned south (left) is in its own shade
  return { poly, lit: [poly[1], poly[2], poly[3], heart], shade: [poly[0], poly[1], heart, [cx - w * 0.08, base]], tone: hh(k, 93), base };
}
// Low lenga scrub: a clump of flattened lobes, the upper ones catching the light,
// with the twigs that are all that is left of it in winter.
function scrub(x, y, r, k) {
  const lobes = Array.from({ length: 5 }, (_, j) => ({
    dx: (j - 2) * r * 0.55 + (hh(k * 7 + j, 110) - 0.5) * r * 0.4,
    dy: -r * (0.25 + 0.5 * hh(k * 7 + j, 111)) * (j === 0 || j === 4 ? 0.5 : 1),
    r: r * (0.55 + 0.35 * hh(k * 7 + j, 112)),
    top: j % 2 === 1,
  }));
  const twigs = Array.from({ length: 6 }, (_, j) => {
    const dx = (j - 2.5) * r * 0.5;
    return [[dx * 0.5, 0], [dx, -r * (0.6 + 0.6 * hh(k * 7 + j, 113))], [dx + (hh(k * 7 + j, 114) - 0.5) * r * 0.7, -r * (1 + 0.5 * hh(k * 7 + j, 115))]];
  });
  return { x, y, r, k, lobes, twigs };
}
function buildShore() {
  const edge = Array.from({ length: 25 }, (_, i) => [i / 24, GRAVEL.y0 + SHORE_JAG * hh(i, 80)]);
  const lip = (x) => chainY(edge, x);
  const clearOfRock = (x) => x < ROCK.x0 - 0.05 || x > ROCK.x1 + 0.05;
  // at the waterline, feet in the lake
  const waterline = [];
  for (let i = 0; waterline.length < 10 && i < 40; i++) {
    const x = 0.03 + 0.94 * hh(i, 95);
    if (clearOfRock(x)) waterline.push(boulder(x, lip(x) + 0.006, 0.028 + 0.05 * hh(i, 96), 0.011 + 0.017 * hh(i, 97), i));
  }
  // low stones where the people walk
  const stones = Array.from({ length: 26 }, (_, i) => boulder(hh(i, 98), GRAVEL.y0 + 0.028 + 0.04 * hh(i, 99), 0.014 + 0.024 * hh(i, 100), 0.004 + 0.006 * hh(i, 101), 40 + i));
  // big blocks in the foreground, the nearest last; none taller than the people's feet
  const blocks = Array.from({ length: 22 }, (_, i) => {
    const base = 0.77 + 0.23 * hh(i, 102);
    const h = Math.min(base - 0.748, 0.03 + 0.05 * hh(i, 104));
    return boulder(-0.04 + 1.08 * hh(i, 103), base, 0.09 + 0.13 * hh(i, 105), h, 60 + i);
  }).sort((a, b) => a.base - b.base);
  return {
    edge,
    boulders: [...waterline, ...stones, ...blocks],
    pebbles: Array.from({ length: 70 }, (_, i) => {
      const x = hh(i, 81);
      const t = hh(i, 82);
      return { x, y: lip(x) + 0.008 + (1 - lip(x) - 0.008) * t * t, r: 0.002 + 0.004 * hh(i, 83) * (0.6 + t), shade: hh(i, 84) };
    }),
    // scrub along the back of the shore at both ends, and bigger clumps nearer, beside the plate
    shrubs: [
      ...[0.045, 0.085, 0.12, 0.155, 0.2, 0.26, 0.795, 0.835, 0.875, 0.92, 0.955].map((x, i) => scrub(x, lip(x) + 0.012 + 0.01 * hh(i, 85), 0.014 + 0.008 * hh(i, 86), i)),
      ...[[0.07, 0.79], [0.15, 0.835], [0.035, 0.9], [0.9, 0.8], [0.96, 0.86], [0.855, 0.9]].map(([x, y], i) => scrub(x, y, 0.024 + 0.012 * hh(i, 87), 20 + i)),
    ],
    // where snow lies on the ground in the cold: low drifts between the stones, the nearest last
    drifts: Array.from({ length: 11 }, (_, i) => {
      const t = hh(i, 116);
      const cx = hh(i, 117);
      const y = GRAVEL.y0 + 0.03 + (1 - GRAVEL.y0 - 0.03) * t;
      const w = 0.1 + 0.16 * hh(i, 118) + 0.1 * t;
      const h = 0.007 + 0.012 * hh(i, 119) + 0.012 * t;
      return { y, poly: [[cx - w / 2, y], [cx - w * 0.36, y - h * 0.8], [cx - w * 0.08, y - h], [cx + w * 0.24, y - h * 0.85], [cx + w / 2, y - h * 0.15], [cx + w * 0.42, y + h * 0.35], [cx - w * 0.3, y + h * 0.4]] };
    }).sort((a, b) => a.y - b.y),
  };
}

// ---- the weather and the clock, as numbers -----------------------------------
// `phase` adds the light of the hour: the first light on the wall, the evening
// silhouette and the moon. `reduced` is prefers-reduced-motion, read by the caller.
export function mood(tint, weather, nowMs, location, phase = null, reduced = false) {
  const band = visibilityBand(weather);
  const wind = windOf(weather);
  const month = monthAt(nowMs, location && location.zone);
  const season = seasonOf(month);
  const frozen = season === 'winter';
  const n = nightAmount(tint.light);
  const cover = coverOf(weather);
  const hasPhase = typeof phase === 'number' && Number.isFinite(phase);
  const clearish = band === 'clear' || band === 'smoking';
  const moon = hasPhase ? moonLight(phase, nowMs) : { up: false, x: 0.5, y: 0.4, k: 0 };
  return {
    n, band, wind, side: plumeSide(weather && weather.windDir), cover,
    month, season, frozen, fresh: freshSnow(weather && weather.temperature), mirror: mirrorAmount(wind, band, frozen),
    kind: weather && weather.known ? weather.kind : null,
    glowK: hasPhase && band !== 'hidden' ? glowStrength(phase) : 0,
    line: hasPhase ? glowLine(phase) : 0,
    sil: hasPhase ? silhouetteAmount(phase) : 0,
    // moonlight reaches the scene only through a fairly open sky, and only at night
    moon: { ...moon, k: moon.k * n * (clearish ? 1 - (cover / 100) * 0.7 : band === 'capped' ? 0.15 : 0) },
    reduced: !!reduced,
  };
}

// ---- drawing helpers ---------------------------------------------------------
export function poly(ctx, L, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(L.X(x), L.Y(y)) : ctx.moveTo(L.X(x), L.Y(y))));
  ctx.closePath();
}
export function line(ctx, L, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(L.X(x), L.Y(y)) : ctx.moveTo(L.X(x), L.Y(y))));
  ctx.stroke();
}
// A soft round puff of colour, painted over what is there.
export function puff(ctx, x, y, r, colour, alpha) {
  if (alpha <= 0.002 || r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(colour, Math.min(1, alpha)));
  g.addColorStop(0.55, css(colour, Math.min(1, alpha) * 0.7));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// The colour of one face of the granite: lit or shaded by where the sun is at
// this hour, toned to night, flattened toward the dusk rock in the evening, and
// hazed toward the sky. Pure, so the tests can name the fills.
export function facetColour(facing, phase, tint, haze = 0.12) {
  let c = mix(EC.graniteShade, EC.graniteLit, facetShade(facing, phase, tint.light));
  c = mix(c, EC.graniteMoon, nightAmount(tint.light));
  c = mix(c, EC.graniteDusk, silhouetteAmount(phase) * 0.85);
  return mix(c, tint.skyLow, haze);
}

// The first light's own colour as the line walks down: red while it is only on
// the tips, orange, then gold as it reaches the foot; deeper on a face turned away.
export function emberTone(line, facing = 1) {
  const late = clamp((line - GLOW_TOP) / (GLOW_FOOT - GLOW_TOP));
  const c = mix(EC.ember, EC.emberGold, late * late * 0.7);
  return facing < -0.2 ? mix(c, EC.emberDeep, 0.55) : c;
}
// How much of that light a height `y` has, 0..1.
export const glowShare = (m, y) => m.glowK * glowAt(y, m.line, SUMMIT.y);
// A fill that carries the light down a shape: `colour` warmed by `warm` from the
// summit to the line. A plain colour when there is no glow.
function glowFill(ctx, L, colour, warm, m, strength = 0.92) {
  if (!(m.glowK > 0)) return css(colour);
  const g = ctx.createLinearGradient(0, L.Y(SUMMIT.y), 0, L.Y(m.line));
  g.addColorStop(0, css(mix(colour, warm, strength * m.glowK)));
  g.addColorStop(0.6, css(mix(colour, mix(warm, EC.emberGold, 0.5), strength * 0.62 * m.glowK)));
  g.addColorStop(1, css(colour));
  return g;
}

// Snow at this hour, before the wall's own shade: white by day (never quite
// white), blue by night, lifted a little by a bright moon.
export function snowTone(m, shade = 0) {
  const day = mix(EC.snow, EC.snowShade, shade);
  const night = mix(mix(EC.snowNight, EC.graniteNight, shade * 0.4), EC.snowMoon, m.moon.k * (1 - shade * 0.6));
  return mix(day, night, m.n);
}

// Snow lying on the wall at height `y`: it dims with the rock at dusk and at
// night, takes the moon, and turns pink in the first light.
export function wallSnow(phase, tint, m, y = SUMMIT.y) {
  let c = mix(snowTone(m), EC.graniteNight, m.n * 0.3 * (1 - m.moon.k));
  c = mix(c, EC.graniteDusk, m.sil * 0.62);
  c = mix(c, EC.emberSnow, 0.85 * glowShare(m, y));
  return mix(c, tint.skyLow, 0.1);
}

function drawRock(ctx, L, body, phase, tint, m, haze) {
  const crack = mix(EC.graniteDeep, EC.graniteNight, m.n);
  ctx.lineWidth = 0.6;
  for (const f of body.facets) {
    const col = facetColour(f.facing, phase, tint, haze);
    poly(ctx, L, f.poly);
    ctx.fillStyle = glowFill(ctx, L, col, emberTone(m.line, f.facing), m, 0.92 * (1 - haze * 0.6));
    ctx.fill();
    ctx.strokeStyle = css(crack, 0.14);
    ctx.stroke();
  }
  // the evening sun behind the wall draws a thin bright rim on the ridgeline, brightest near it
  if (m.sil > 0.05 && haze < 0.4 && m.band !== 'hidden') {
    const top = body.outline.slice(0, -2);
    const cx = top.reduce((s, p) => s + p[0], 0) / top.length;
    ctx.strokeStyle = css(EC.sunsetRim, 0.85 * m.sil * (1 - m.n) * clamp(1.15 - Math.abs(cx - SUN_X) * 1.9, 0.25, 1));
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    line(ctx, L, top);
  }
  if (haze > 0.3) return;
  // the pillars' edges catch the light, the cracks between them hold the dark
  const day = (1 - m.n) * (1 - m.sil);
  ctx.strokeStyle = css(mix(EC.graniteLit, EC.graniteNight, m.n), 0.16 + 0.2 * day);
  ctx.lineWidth = 1.1;
  for (const r of body.ridges) line(ctx, L, r);
  ctx.fillStyle = css(crack, 0.5 + 0.2 * m.n);
  for (const c of body.couloirs) { poly(ctx, L, c); ctx.fill(); }
  for (const s of body.streaks) {
    ctx.fillStyle = css(wallSnow(phase, tint, m, s[0][1]), 0.95);
    poly(ctx, L, s);
    ctx.fill();
  }
  // in the cold every ledge carries a second, wider sliver under the first
  if (m.frozen || m.fresh) {
    for (const s of body.streaks) {
      ctx.fillStyle = css(wallSnow(phase, tint, m, s[0][1]), m.frozen ? 0.9 : 0.6);
      poly(ctx, L, s.map(([x, y]) => [s[1][0] + (x - s[1][0]) * 1.5 + 0.004, y + 0.012]));
      ctx.fill();
    }
  }
  // by night a thin moonlit rim keeps the skyline
  if (m.n > 0.3) {
    ctx.strokeStyle = css(EC.moonRim, (0.45 + 0.45 * m.moon.k) * m.n);
    ctx.lineWidth = 1;
    line(ctx, L, body.outline.slice(0, -2));
  }
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = css(crack, 0.1);
  body.grain.forEach((g, i) => { if (i % 2 === 0) line(ctx, L, g); });
  ctx.strokeStyle = css(crack, 0.2);
  body.grain.forEach((g, i) => { if (i % 2 === 1) line(ctx, L, g); });
}

// The evening sun goes down behind the col between Poincenot and Fitz Roy.
export const SUN_X = 0.452;
// Air between the layers: each one further off is paler, and a thin haze lies
// along the foot of the wall, so the moraine in front of it reads darker and nearer.
export const HAZE = { far: 0.46, south: 0.3, wall: 0.12, foot: 0.26 };

export function drawWall(ctx, L, phase, tint, plates, m) {
  drawRock(ctx, L, plates.far, phase, tint, m, HAZE.far);
  for (const b of plates.south) drawRock(ctx, L, b, phase, tint, m, HAZE.south);
  drawRock(ctx, L, plates.poincenot, phase, tint, m, HAZE.wall);
  drawRock(ctx, L, plates.fitzroy, phase, tint, m, HAZE.wall);
  for (const b of plates.needles) drawRock(ctx, L, b, phase, tint, m, HAZE.wall);
  for (const s of [...plates.snowfields, ...plates.caps]) {
    ctx.fillStyle = css(wallSnow(phase, tint, m, s[0][1]), 0.96);
    poly(ctx, L, s);
    ctx.fill();
  }
  // the gullies' own shadow side: the south half of each snow cone is blue
  ctx.fillStyle = css(mix(snowTone(m, 1), EC.graniteDusk, m.sil * 0.5), 0.35);
  for (const s of plates.snowfields.slice(0, 2)) {
    const tip = s.reduce((a, p) => (p[1] < a[1] ? p : a));
    poly(ctx, L, [s[0], ...s.slice(1, s.indexOf(tip) + 1), [(s[0][0] + s[s.length - 1][0]) / 2, s[0][1]]]);
    ctx.fill();
  }
  // the haze at the foot of the wall
  const y0 = L.Y(0.22);
  const y1 = L.Y(0.42);
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, css(tint.skyLow, 0));
  g.addColorStop(1, css(tint.skyLow, HAZE.foot * (1 - m.n * 0.5)));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, y0, L.w, y1 - y0);
}

// The hanging glacier and the bench of slabs it stands on: lit ice with its own
// blue shadow sides, an ice cliff along the front, a few crevasses down the flow.
export function drawGlacier(ctx, L, phase, tint, plates, m) {
  const g = plates.glacier;
  const wet = m.band === 'hidden' ? 0.35 : 0;
  const rock = (c) => mix(mix(mix(c, EC.moraineRock, wet), EC.moraineDusk, m.sil * 0.6), EC.graniteNight, m.n);
  poly(ctx, L, g.bench);
  ctx.fillStyle = css(rock(EC.bench));
  ctx.fill();
  ctx.fillStyle = css(rock(EC.benchLit), 0.8);
  for (const b of g.benchLit) { poly(ctx, L, b); ctx.fill(); }
  if (m.frozen || m.fresh) {
    ctx.fillStyle = css(snowTone(m, 0.7), m.frozen ? 0.7 : 0.4);
    for (const b of g.benchLit) { poly(ctx, L, b); ctx.fill(); }
  }
  // the ice: in the evening it lies in the wall's shadow, at first light it is pink
  const ice = (c, y) => mix(mix(mix(mix(c, EC.glacierShade, m.sil * 0.6), EC.glacierNight, m.n * (1 - 0.3 * m.moon.k)), EC.emberSnow, 0.7 * glowShare(m, y)), tint.skyLow, 0.08);
  poly(ctx, L, g.outline);
  ctx.fillStyle = css(ice(EC.glacier, 0.37));
  ctx.fill();
  ctx.fillStyle = css(ice(EC.glacierShade, 0.39), 0.8);
  for (const s of g.shades) { poly(ctx, L, s); ctx.fill(); }
  poly(ctx, L, g.cliff);
  ctx.fillStyle = css(ice(EC.iceCliff, 0.43));
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = css(ice(EC.glacier, 0.43), 0.55);
  for (const s of g.seracs) line(ctx, L, s);
  ctx.strokeStyle = css(ice(EC.crevasse, 0.4), 0.85);
  for (const c of g.crevasses) line(ctx, L, c);
  // the lip of the cliff takes the light
  ctx.strokeStyle = css(ice(EC.snow, 0.42), 0.7 * (1 - m.n * 0.6));
  ctx.lineWidth = 1.2;
  line(ctx, L, g.brow);
  if (!m.frozen) {
    ctx.strokeStyle = css(mix(EC.ripple, EC.glacierNight, m.n * 0.7), 0.7);
    ctx.lineWidth = 1.2;
    line(ctx, L, g.melt);
  }
}

// The low brown moraine, its scree, and the snow of the season.
export function drawMoraine(ctx, L, phase, tint, plates, m) {
  const mo = plates.moraine;
  // wet and dark under a hidden sky, in the wall's shadow in the evening
  const wet = m.band === 'hidden' ? 0.4 : 0;
  const air = (c) => (wet || m.sil ? mix(mix(c, EC.moraineRock, wet), EC.moraineDusk, m.sil * 0.5) : c);
  const base = air(tone(EC.moraineDay, EC.moraineDusk, EC.moraineNight, m.n));
  poly(ctx, L, mo.slope);
  ctx.fillStyle = css(base);
  ctx.fill();
  poly(ctx, L, mo.outline);
  ctx.fillStyle = css(base);
  ctx.fill();
  const plane = { lit: EC.moraineLit, dark: EC.moraineShade, rock: EC.moraineRock, apron: EC.screeLight };
  const planeAlpha = { lit: 0.75, dark: 0.7, rock: 0.85, apron: 0.4 };
  const paintPlane = (p, k) => {
    poly(ctx, L, p.poly);
    ctx.fillStyle = css(air(tone(plane[p.kind], mix(plane[p.kind], EC.moraineDusk, 0.6), EC.moraineNight, m.n)), planeAlpha[p.kind] * k);
    ctx.fill();
  };
  const paintShade = (k) => {
    poly(ctx, L, mo.shade);
    ctx.fillStyle = css(air(mix(EC.moraineShade, EC.moraineNight, m.n)), 0.55 * k);
    ctx.fill();
  };
  const paintScree = (every) => {
    mo.scree.forEach((s, i) => {
      if (i % every) return;
      ctx.fillStyle = css(mix(mix(EC.screeDark, EC.screeLight, s.shade * (1 - wet)), EC.moraineNight, m.n * 0.85), 0.9);
      ctx.fillRect(L.X(s.x), L.Y(s.y), Math.max(1, s.r * L.w), Math.max(1, s.r * L.w * 0.8));
    });
  };
  for (const p of mo.planes) paintPlane(p, 1);
  paintShade(1);
  paintScree(1);
  const patchAlpha = m.season === 'spring' ? 0.9 : m.season === 'autumn' ? 0.3 : 0;
  if (patchAlpha > 0) {
    ctx.fillStyle = css(snowTone(m), patchAlpha);
    for (const p of mo.patches) { poly(ctx, L, p); ctx.fill(); }
  }
  // snow on the hill: blue-grey where it lies in its own shade, bright only on the
  // planes turned to the sun, and none on the steep dark faces
  const cover = m.frozen ? 0.86 : m.fresh ? 0.5 : 0;
  if (cover > 0) {
    ctx.fillStyle = css(snowTone(m, 0.85), cover);
    poly(ctx, L, mo.outline);
    ctx.fill();
    poly(ctx, L, mo.slope);
    ctx.fill();
    ctx.fillStyle = css(mix(snowTone(m, 0.3), EC.moraineDusk, m.sil * 0.4), cover * 0.9);
    for (const p of mo.planes) if (p.kind === 'lit') { poly(ctx, L, p.poly); ctx.fill(); }
    for (const p of mo.planes) if (p.kind === 'dark' || p.kind === 'rock') paintPlane(p, 0.95);
    paintShade(0.8);
    paintScree(2);
  }
  // the first light reaches the top of the moraine last, and only warms it
  if (m.glowK > 0 && m.line > 0.4) {
    const g = ctx.createLinearGradient(0, L.Y(0.39), 0, L.Y(m.line));
    g.addColorStop(0, css(EC.emberGold, 0.42 * m.glowK));
    g.addColorStop(1, css(EC.emberGold, 0));
    ctx.fillStyle = g;
    poly(ctx, L, mo.outline);
    ctx.fill();
    poly(ctx, L, mo.slope);
    ctx.fill();
  }
}
