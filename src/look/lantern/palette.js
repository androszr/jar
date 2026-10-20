// Lantern: the only file in src/look/ allowed colour literals. Colours are
// [r, g, b] arrays so the light and draw modules can mix them; `css` turns one
// into a string for the canvas.

export const css = (c, a = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const PALETTE = {
  page: [5, 9, 9],
  greenBlack: [9, 17, 15],
  nightBlue: [14, 26, 42],
  plankLight: [34, 48, 44],
  plankDark: [14, 24, 22],
  seam: [4, 8, 8],
  tableTop: [46, 36, 30],
  tableEdge: [26, 20, 17],
  frame: [20, 28, 28],
  amber: [255, 178, 74],
  amberEdge: [190, 120, 40],
  glass: [170, 226, 236],
  moon: [222, 234, 242],
  star: [235, 240, 255],
  cork: [168, 124, 82],
  corkDark: [112, 78, 48],
  tin: [118, 128, 130],
  tinDark: [60, 68, 70],
  brass: [182, 150, 84],
  plate: [12, 18, 18],
  labelInk: [226, 214, 170],
  labelDim: [140, 138, 112],
  cloud: [206, 216, 228],
  rain: [170, 200, 235],
  snow: [245, 248, 255],
  fog: [200, 214, 218],
  flash: [235, 240, 255],
  dew: [176, 214, 226],
  dewHighlight: [232, 240, 246],
  sun: [255, 230, 160],
  firefly: [190, 255, 140],
  pot: [28, 34, 30],
};

// Per-keyframe tints, keyed by the clock's nine keyframe names.
// skyTop/skyLow: the sky; ambient: how much the shed is lit by the window;
// lantern: the jar's interior glow; spill: light pooled on the table;
// bloom: how hard the bloom pass is applied.
export const TINTS = {
  dawn: { skyTop: [40, 50, 92], skyLow: [232, 150, 124], ambient: 0.22, lantern: [255, 190, 100], spill: [255, 190, 120], bloom: 0.26 },
  sunrise: { skyTop: [72, 112, 172], skyLow: [255, 172, 112], ambient: 0.36, lantern: [255, 196, 110], spill: [255, 200, 130], bloom: 0.28 },
  morning: { skyTop: [84, 140, 205], skyLow: [160, 196, 226], ambient: 0.55, lantern: [255, 214, 140], spill: [255, 222, 160], bloom: 0.3 },
  noon: { skyTop: [58, 120, 206], skyLow: [138, 186, 228], ambient: 0.7, lantern: [255, 226, 160], spill: [255, 232, 180], bloom: 0.34 },
  afternoon: { skyTop: [68, 126, 204], skyLow: [150, 190, 226], ambient: 0.64, lantern: [255, 220, 150], spill: [255, 226, 170], bloom: 0.32 },
  golden: { skyTop: [112, 142, 202], skyLow: [255, 202, 124], ambient: 0.46, lantern: [255, 200, 110], spill: [255, 206, 130], bloom: 0.3 },
  sunset: { skyTop: [62, 62, 132], skyLow: [255, 122, 84], ambient: 0.32, lantern: [255, 184, 90], spill: [255, 188, 110], bloom: 0.28 },
  dusk: { skyTop: [24, 30, 72], skyLow: [152, 82, 112], ambient: 0.18, lantern: [255, 178, 80], spill: [255, 180, 96], bloom: 0.3 },
  night: { skyTop: [6, 10, 26], skyLow: [22, 36, 62], ambient: 0.08, lantern: [255, 172, 70], spill: [255, 172, 84], bloom: 0.34 },
};

// Custom properties for style.css.
export const CSS_VARS = {
  '--page': css(PALETTE.page),
  '--tag': css(PALETTE.plate, 0.82),
  '--tag-ink': css(PALETTE.labelInk),
  '--tag-edge': css(PALETTE.brass, 0.7),
};
