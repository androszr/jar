// Boot, render loop and wiring: the potting table, the jars on it, the lift.
import { readOptions, sample } from './clock.js';
import { placeGuess, realPhase } from './realclock.js';
import { therePhase, localDate } from './placeclock.js';
import { LOOK, CSS_VARS, tint as lookTint, bloom, vignette, forecastCard } from './look/index.js';
import { CITIES } from './cities/index.js';
import { Shelf, shelfMetrics, frameDt } from './shelf.js';
import { fitScreen, SCENE } from './framing.js';
import { Lift, liftCamera } from './lift.js';
import { forecastPose, forecastExtent } from './forecast.js';
import { forecastCells, flashIntensity, dewAmount, cloudAmount, cloudDrift } from './weather.js';
import { entryFor, jarSearch, tableSearch, leaveAction } from './address.js';
import { WeatherFeed } from './weatherfeed.js';
import { buildShedArt, drawShed, tintBucket } from './shed.js';
import { paintJar, labelLines, bodyRect, QUALITY } from './jar.js';

const opts = readOptions(location.search);
const canvas = document.getElementById('view');
const backBtn = document.getElementById('back');
const navEl = document.getElementById('shelfnav');
// Under automation (the smoke check reads pixels back constantly) the canvas
// is made software-backed up front: Chromium otherwise flips it from GPU to
// CPU mid-run, and the two rasterise gradients a shade apart.
const ctx = canvas.getContext('2d', { willReadFrequently: navigator.webdriver === true });

for (const [k, v] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(k, v);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const feed = new WeatherFeed({ now: () => nowMs(), visible: () => document.visibilityState === 'visible' });
const lift = new Lift(reduceMotion ? 0 : undefined);
const shelf = new Shelf(CITIES.length, shelfMetrics(SCENE.w));

const ANIMATED = new Set(['rain', 'drizzle', 'snow', 'storm', 'fog']);
const MIN_FRAME_MS = 45;
const CLOUD_TICK_MS = 250; // windy cloud redraws this often; calm cloud keeps the once-a-minute key

let W = 0;
let H = 0;
let dpr = 1;
let view = 'table';
let pendingBack = false; // a history.back() is on its way
let focus = 0; // the jar the lift is on
let pinned = null;
let lastKey = '';
let lastDraw = 0;
let lastTick = null; // the previous animation frame's time, for the glide's dt
let artBuilds = 0;
let artKey = '';
let art = null;
let lastFrameMs = 0;
let labels = {};
let cadenceMs = 0; // the redraw tick the last render keyed on: 50 animated, 250 windy cloud, 0 otherwise
let drawn = {}; // city id -> { flash, dew, drift } the last frame painted with
let lastForecast = null; // { cells, rect } of the card drawn last, or null
let cam = { cx: SCENE.w / 2, cy: SCENE.h / 2, scale: 1 };
let scratch = null;
let plates = [];
let ready = false;

const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const nowMs = () => (pinned !== null ? pinned : Date.now());
const perf = () => performance.now();

function viewerAt(ms) {
  return placeGuess(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date(ms).getTimezoneOffset());
}

function fit() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const f = fitScreen(W, H, shelf.centreX);
  shelf.setMetrics(shelfMetrics(f.slice.w));
  build();
  lastKey = '';
}

function build() {
  const body = bodyRect();
  const small = make(16, 16);
  scratch = {
    interior: make(body.w * QUALITY, body.h * QUALITY),
    small,
    smallCtx: small.getContext('2d', { willReadFrequently: true }),
    bloomCanvas: make(Math.ceil(canvas.width / 4), Math.ceil(canvas.height / 4)),
    bloomCtx: null,
  };
  scratch.bloomCtx = scratch.bloomCanvas.getContext('2d');
  plates = CITIES.map((c) => c.buildPlates(body.w, body.h));
  art = null;
  artKey = '';
}

function ensureArt(tn) {
  const s = Math.max(0.4, Math.min(1.5, fitScreen(W, H).scale * dpr));
  const key = `${Math.round(s * 10)}|${tintBucket(tn)}`;
  if (key === artKey && art) return;
  art = buildShedArt(Math.round(SCENE.w * s), Math.round(SCENE.h * s), tn);
  artKey = key;
  artBuilds += 1;
}

function sceneToCss(sx, sy) {
  return { x: W / 2 + (sx - cam.cx) * cam.scale, y: H / 2 + (sy - cam.cy) * cam.scale };
}
function cssToScene(px, py) {
  return { x: cam.cx + (px - W / 2) / cam.scale, y: cam.cy + (py - H / 2) / cam.scale };
}

function currentCam(t) {
  const c0 = fitScreen(W, H, shelf.centreX);
  const e = lift.progress(t);
  if (e > 0) {
    const jar = shelf.jarRect(focus);
    return liftCamera(e, jar, { cx: c0.cx, cy: c0.cy, scale: c0.scale, viewH: H, viewW: W }, forecastExtent(jar, c0.portrait));
  }
  return { cx: c0.cx, cy: c0.cy, scale: c0.scale };
}

function render(force = false) {
  const t = perf();
  const ms = nowMs();
  const viewer = viewerAt(ms);
  const shedPhase = realPhase(ms, viewer);
  const phases = CITIES.map((c) => therePhase(ms, c.location, viewer));
  const weathers = CITIES.map((c) => feed.get(c.id));
  // lightning and dew per jar: functions of the moment and the feed alone
  const flashes = CITIES.map((c, i) => flashIntensity(weathers[i].code, ms, { reduced: reduceMotion }));
  const dews = CITIES.map((c) => dewAmount(feed.dewSince(c.id, ms)));
  const animated = weathers.some((w) => ANIMATED.has(w.kind) && w.known);
  const windy = weathers.some((w) => w.known && cloudAmount(w.cloudCover, w.kind) > 0.05 && cloudDrift(w.windSpeed, w.windDir, CLOUD_TICK_MS) !== 0);
  cadenceMs = animated ? 50 : windy ? CLOUD_TICK_MS : 0;
  const minute = Math.floor(ms / 60000);
  cam = currentCam(t);
  const key = [view, lift.state, Math.round(lift.progress(t) * 1000), Math.round(shelf.pos * 1000), minute,
    feed.revision, W, H, Math.round(shedPhase * 2000), phases.map((p) => Math.round(p * 2000)).join(','),
    cam.scale.toFixed(3), animated ? Math.floor(ms / 50) : windy ? Math.floor(ms / CLOUD_TICK_MS) : 0,
    flashes.map((f) => Math.round(f * 16)).join(','), dews.map((d) => Math.round(d * 32)).join(',')].join('|');
  if (!force && key === lastKey) return false;
  lastKey = key;

  const shedTint = lookTint(sample(shedPhase));
  ensureArt(shedTint);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const k = dpr * cam.scale;
  const tx = dpr * (W / 2 - cam.cx * cam.scale);
  const ty = dpr * (H / 2 - cam.cy * cam.scale);
  ctx.setTransform(k, 0, 0, k, tx, ty);
  scratch.bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratch.bloomCtx.clearRect(0, 0, scratch.bloomCanvas.width, scratch.bloomCanvas.height);
  scratch.bloomCtx.setTransform(k / 4, 0, 0, k / 4, tx / 4, ty / 4);

  drawShed(ctx, art, shedTint, null, shedPhase);
  let bloomStrength = 0;
  const nextLabels = {};
  const nextDrawn = {};
  CITIES.forEach((city, i) => {
    const tn = lookTint(sample(phases[i]));
    const painted = paintJar(ctx, shelf.jarRect(i), city, phases[i], tn, weathers[i], ms, plates[i], scratch, { reduced: reduceMotion, dew: dews[i] });
    nextDrawn[city.id] = { flash: flashes[i], dew: dews[i], drift: painted.drift };
    nextLabels[city.id] = labelLines(city, weathers[i], ms);
    bloomStrength = Math.max(bloomStrength, tn.bloom);
  });
  labels = nextLabels;
  drawn = nextDrawn;
  // the forecast card of the lifted jar, riding the lift's own progress
  const pose = forecastPose(shelf.jarRect(focus), fitScreen(W, H, shelf.centreX).portrait, lift.progress(t));
  if (pose) {
    const cells = forecastCells(weathers[focus], localDate(ms, CITIES[focus].location.zone));
    ctx.save();
    // emerge from behind the glass: nothing of the card is drawn over the jar
    const jr = shelf.jarRect(focus);
    ctx.beginPath();
    ctx.rect(-1e5, -1e5, 2e5, 2e5);
    ctx.rect(jr.x, jr.y, jr.w, jr.h);
    ctx.clip('evenodd');
    ctx.globalAlpha = pose.alpha;
    forecastCard(ctx, pose.rect, cells, pose.layout);
    ctx.restore();
    lastForecast = { cells, rect: pose.rect };
  } else {
    lastForecast = null;
  }
  bloom(scratch.bloomCanvas, ctx, bloomStrength);
  // the vignette, over everything, in device px
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  vignette(ctx, canvas.width, canvas.height);
  lastFrameMs = perf() - t;
  return true;
}

function frame() {
  const t = perf();
  if (pinned === null) feed.tick(Date.now());
  shelf.step(frameDt(t, lastTick));
  lastTick = t;
  if (t - lastDraw >= MIN_FRAME_MS || lift.moving || shelf.dragging) {
    if (render()) lastDraw = t;
  }
  syncChrome();
  syncAria();
  requestAnimationFrame(frame);
}

function syncChrome() {
  const lifted = view === 'jar';
  if (backBtn.hidden === lifted) backBtn.hidden = !lifted;
  const showNav = !lifted && CITIES.length > 1;
  if (navEl.hidden === showNav) navEl.hidden = !showNav;
}

// The label is only canvas pixels, so the canvas's accessible name carries it.
let ariaText = '';
function syncAria() {
  const cells = view === 'jar' ? forecastCells(feed.get(CITIES[focus].id), localDate(nowMs(), CITIES[focus].location.zone)) : null;
  const days = cells && cells[0].day !== '—'
    ? ` Next five days: ${cells.map((c) => `${c.day} ${c.high} to ${c.low}`).join(', ')}.`
    : '';
  const c = CITIES[focus];
  const l = labels[c.id];
  const facts = l ? `${c.title}, ${l[1]}, ${l[2]} local time` : c.title;
  const text = view === 'jar'
    ? `${facts}. The jar is lifted.${days} Press Escape to put it back on the table.`
    : `A potting table with a glass jar of ${facts}. Press Enter to lift the jar.`;
  if (text !== ariaText) {
    ariaText = text;
    canvas.setAttribute('aria-label', text);
  }
}

function setTitle() {
  document.title = view === 'jar' ? `${CITIES[focus].title}, in a jar` : 'Jars';
}

function doLift(i) {
  if (i < 0 || i >= CITIES.length) return;
  focus = i;
  shelf.go(i);
  shelf.pos = shelf.target;
  view = 'jar';
  lift.open(perf());
  setTitle();
  syncChrome();
  if (document.activeElement === canvas) {
    backBtn.focus();
  }
  lastKey = '';
}

function doLower() {
  if (view !== 'jar') return;
  view = 'table';
  pendingBack = false;
  lift.close(perf());
  setTitle();
  if (document.activeElement === backBtn) canvas.focus();
  syncChrome();
  lastKey = '';
}

function liftFromUser(i) {
  if (view === 'jar' || i < 0) return;
  doLift(i);
  history.pushState(entryFor('jar', CITIES[i].id, true), '', location.pathname + jarSearch(location.search, CITIES[i].id));
}

function lowerFromUser() {
  if (view !== 'jar' || pendingBack) return;
  if (leaveAction(history.state) === 'back') {
    pendingBack = true; // a second lower before popstate must not go back again
    history.back(); // popstate does the visual lowering
  } else {
    history.replaceState(entryFor('table'), '', location.pathname + tableSearch(location.search));
    doLower();
  }
}

window.addEventListener('popstate', (e) => {
  const s = e.state;
  if (s && s.lane === 'jar') {
    const i = CITIES.findIndex((c) => c.id === s.id);
    if (i >= 0) doLift(i);
  } else {
    doLower();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lowerFromUser();
});
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    liftFromUser(shelf.index);
  } else if (e.key === 'ArrowRight' && view === 'table') shelf.next();
  else if (e.key === 'ArrowLeft' && view === 'table') shelf.prev();
});
backBtn.addEventListener('click', lowerFromUser);
document.getElementById('prev').addEventListener('click', () => shelf.prev());
document.getElementById('next').addEventListener('click', () => shelf.next());

// Pointer: a short press lifts the jar under it; a drag slides the row.
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  if (view !== 'table') return;
  canvas.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, travel: 0, id: e.pointerId };
  // Dragged in scene units from the screen position alone, so the camera
  // following the row never feeds back into the measure.
  shelf.dragStart(e.clientX / cam.scale, e.timeStamp);
});
canvas.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  press.travel = Math.max(press.travel, Math.hypot(e.clientX - press.x, e.clientY - press.y));
  shelf.dragMove(e.clientX / cam.scale, e.timeStamp);
});
function release(e) {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  press = null;
  if (p.travel < 8) {
    shelf.dragEnd(0);
    const s = cssToScene(e.clientX, e.clientY);
    liftFromUser(shelf.hit(s.x, s.y));
  } else {
    shelf.dragEnd();
  }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => {
  if (view === 'table' && CITIES.length > 1) {
    e.preventDefault();
    shelf.wheel(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
  }
}, { passive: false });

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fit, 150);
});

function hashCanvas() {
  const d = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
  return h;
}

window.__jar = {
  get ready() { return ready; },
  get view() { return view; },
  look: LOOK,
  get labels() { return labels; },
  get index() { return shelf.index; },
  get pos() { return shelf.pos; },
  get artBuilds() { return artBuilds; },
  get lastFrameMs() { return lastFrameMs; },
  get lifting() { return lift.moving; },
  lift: (id) => liftFromUser(CITIES.findIndex((c) => c.id === id)),
  lower: lowerFromUser,
  pin(ms) {
    pinned = ms;
    render(true);
  },
  hash() { return hashCanvas(); },
  // Hand the feed an answer now (the tidy body, or the vendor's { current } for
  // every city); dew is dated by the pinned moment when there is one.
  applyWeather(body) {
    let b = body;
    if (b && typeof b === 'object' && b.current && typeof b.current === 'object') {
      const c = b.current;
      const entry = { temperature: c.temperature_2m, code: c.weather_code, cloudCover: c.cloud_cover, isDay: c.is_day, windSpeed: c.wind_speed_10m, windDir: c.wind_direction_10m };
      b = { v: 1, cities: Object.fromEntries(CITIES.map((city) => [city.id, entry])) };
    }
    const changed = feed.applyResponse(b);
    render(true);
    return changed;
  },
  get cadenceMs() { return cadenceMs; },
  drift: (id) => (drawn[id] ? drawn[id].drift : 0),
  dew: (id) => (drawn[id] ? drawn[id].dew : 0),
  flash: (id) => (drawn[id] ? drawn[id].flash : 0),
  blankHash() {
    const blank = make(canvas.width, canvas.height);
    const d = new Uint32Array(blank.getContext('2d').getImageData(0, 0, blank.width, blank.height).data.buffer);
    let h = 2166136261;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
    return h;
  },
  // Canvas-pixel position of a scene point, and of a jar's foot.
  toCanvas(sx, sy) {
    const p = sceneToCss(sx, sy);
    return { x: p.x * dpr, y: p.y * dpr };
  },
  foot(id) {
    const r = shelf.jarRect(CITIES.findIndex((c) => c.id === id));
    return this.toCanvas(r.x + r.w / 2, r.y + r.h);
  },
  // The forecast card last drawn: null on the table, else { cells, rect } in canvas px.
  get forecast() {
    if (!lastForecast) return null;
    const r = lastForecast.rect;
    const a = this.toCanvas(r.x, r.y);
    const b = this.toCanvas(r.x + r.w, r.y + r.h);
    return { cells: lastForecast.cells, rect: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } };
  },
  get dpr() { return dpr; },
  get framing() { return fitScreen(W, H, shelf.centreX); },
};

fit();
feed.start();
if (opts.jar && CITIES.some((c) => c.id === opts.jar)) {
  const i = CITIES.findIndex((c) => c.id === opts.jar);
  history.replaceState(entryFor('jar', opts.jar, false), '', location.pathname + location.search);
  doLift(i);
  lift.snap(true);
} else {
  history.replaceState(entryFor('table'), '', location.pathname + location.search);
}
setTitle();
syncChrome();
render(true);
syncAria();
ready = true;
requestAnimationFrame(frame);
