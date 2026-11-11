// Boot, render loop and wiring: the potting table, the jars on it, the lift.
import { readOptions, sample, isNight, moonPos } from './clock.js';
import { moonPhase } from './moon.js';
import { placeGuess, realPhase } from './realclock.js';
import { therePhase, localDate, sunFraction, localTimeText, dayFraction } from './placeclock.js';
import { LOOK, CSS_VARS, tint as lookTint, bloom, vignette, forecastCard, chalk, chalkWidth } from './look/index.js';
import { hintWording, hintSentence, initialHint, hintOnLift, hintAfter, hintAlpha, hintPose } from './hint.js';
import { CITIES } from './cities/index.js';
import { placeName } from './cities/places.js';
import { Shelf, shelfMetrics, frameDt } from './shelf.js';
import { fitScreen, SCENE } from './framing.js';
import { Lift, liftCamera, pressLowers, CREDIT_MARGIN } from './lift.js';
import { forecastPose, forecastExtent, liftExtent } from './forecast.js';
import { offsetText, previewWeather, clampScrub } from './scrub.js';
import { ScrubBar } from './scrubbar.js';
import { formatTemp, forecastCells, forecastSentence, sunTimesFor, tidesFor, tideSentence, flashIntensity, dewAmount, cloudAmount, cloudDrift } from './weather.js';
import { entryFor, jarSearch, tableSearch, leaveAction } from './address.js';
import { WeatherFeed } from './weatherfeed.js';
import { forecastAnnouncement } from './announce.js';
import { buildShedArt, drawShed, tintBucket } from './shed.js';
import { paintJar, labelLines, bodyRect, QUALITY } from './jar.js';
import { JAR } from './jar-geometry.js';

const opts = readOptions(location.search);
const canvas = document.getElementById('view');
const backBtn = document.getElementById('back');
const liveEl = document.getElementById('announce');
const navEl = document.getElementById('shelfnav');
const scrubEl = document.getElementById('scrub');
// Under automation (the smoke check reads pixels back constantly) the canvas
// is made software-backed up front: Chromium otherwise flips it from GPU to
// CPU mid-run, and the two rasterise gradients a shade apart.
const ctx = canvas.getContext('2d', { willReadFrequently: navigator.webdriver === true });

for (const [k, v] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(k, v);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const hintText = hintWording(coarsePointer); // read once at boot, never in a draw
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
let scrubMin = 0; // minutes ahead the lifted jar is previewed at; 0 is now
let lastKey = '';
let lastShedAmbient = 0; // the shed tint's ambient at the last render (test surface)
let lastDraw = 0;
let lastTick = null; // the previous animation frame's time, for the glide's dt
let artBuilds = 0;
let artKey = '';
let art = null;
let lastFrameMs = 0;
let labels = {};
let cadenceMs = 0; // the redraw tick the last render keyed on: the smallest positive of the weather's and each city's
let weatherCadence = 0; // 50 animated, 250 windy cloud, 0 otherwise
let cityCadences = {}; // city id -> ms the scene asks for (0 for a still one)
let scenes = {}; // city id -> what the scene reported painting
let drawn = {}; // city id -> { flash, dew, drift, moon } the last frame painted with
let lastForecast = null; // { cells, rect, sun, sunT, tides, dayT } of the card drawn last, or null
let cam = { cx: SCENE.w / 2, cy: SCENE.h / 2, scale: 1 };
let scratch = null;
let plates = [];
let ready = false;
let hint = 'shown'; // the chalk hint: shown | fading | none, session memory only

const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const nowMs = () => (pinned !== null ? pinned : Date.now());
const previewMs = () => nowMs() + scrubMin * 60000;
const perf = () => performance.now();

function viewerAt(ms) {
  return placeGuess(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date(ms).getTimezoneOffset());
}

// The Open-Meteo credit link's left and bottom edges in CSS px (measured when the screen is fitted),
// and the slider row's height plus its inset from the foot: the lifted picture keeps clear of both.
let creditBox = null;
const SCRUB_ROW = 58;

function fit() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  const cr = document.getElementById('credit')?.getBoundingClientRect();
  creditBox = cr && cr.width > 0 ? { left: cr.left, bottom: cr.bottom } : null;
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
    const dview = { cx: c0.cx, cy: c0.cy, scale: c0.scale, viewH: H, viewW: W, credit: creditBox, core: forecastExtent(jar, c0.portrait), bottomReserve: SCRUB_ROW + CREDIT_MARGIN };
    return liftCamera(e, jar, dview, liftExtent(jar, c0.portrait));
  }
  return { cx: c0.cx, cy: c0.cy, scale: c0.scale };
}

function render(force = false) {
  const t = perf();
  const ms = nowMs();
  const viewer = viewerAt(ms);
  const shedPhase = realPhase(ms, viewer);
  // Only the lifted jar travels: its moment is the previewed one, every other jar
  // and the shed stay on `ms`.
  const scrubbing = view === 'jar' && scrubMin > 0;
  const at = CITIES.map((c, i) => (scrubbing && i === focus ? previewMs() : ms));
  const phases = CITIES.map((c, i) => therePhase(at[i], c.location, viewer));
  const weathers = CITIES.map((c, i) => (scrubbing && i === focus ? previewWeather(feed.get(c.id), at[i], c.location.zone) : feed.get(c.id)));
  const preview = scrubbing ? { offsetMin: scrubMin } : null;
  // lightning and dew per jar: functions of the moment and the feed alone
  const flashes = CITIES.map((c, i) => flashIntensity(weathers[i].code, at[i], { reduced: reduceMotion }));
  const dews = CITIES.map((c, i) => dewAmount(feed.dewSince(c.id, at[i])));
  const animated = weathers.some((w) => ANIMATED.has(w.kind) && w.known);
  const windy = weathers.some((w) => w.known && cloudAmount(w.cloudCover, w.kind) > 0.05 && cloudDrift(w.windSpeed, w.windDir, CLOUD_TICK_MS) !== 0);
  weatherCadence = animated ? 50 : windy ? CLOUD_TICK_MS : 0;
  // a scene may ask for a tick of its own (a rolling sea); the page ticks at the smallest
  cityCadences = Object.fromEntries(CITIES.map((c, i) => [c.id, typeof c.cadenceMs === 'function' ? c.cadenceMs(weathers[i], { reduced: reduceMotion }) : 0]));
  const positive = [weatherCadence, ...Object.values(cityCadences)].filter((v) => v > 0);
  cadenceMs = positive.length ? Math.min(...positive) : 0;
  const minute = Math.floor(ms / 60000);
  const liftP = lift.progress(t); // settles lift.state first
  hint = hintAfter(hint, liftP, lift.state);
  const hintA = hintAlpha(hint, liftP);
  cam = currentCam(t);
  const key = [view, lift.state, Math.round(lift.progress(t) * 1000), Math.round(shelf.pos * 1000), minute,
    feed.revision, feed.isStale(), W, H, Math.round(shedPhase * 2000), phases.map((p) => Math.round(p * 2000)).join(','),
    cam.scale.toFixed(3), cadenceMs ? Math.floor(ms / cadenceMs) : 0, scrubbing ? scrubMin : 0,
    flashes.map((f) => Math.round(f * 16)).join(','), dews.map((d) => Math.round(d * 32)).join(','), hint, Math.round(hintA * 64)].join('|');
  if (!force && key === lastKey) return false;
  lastKey = key;

  const shedTint = lookTint(sample(shedPhase));
  lastShedAmbient = shedTint.ambient;
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

  drawShed(ctx, art, shedTint, null, shedPhase, ms);
  if (hintA > 0) {
    const hp = hintPose(fitScreen(W, H, shelf.centreX).cx);
    chalk(ctx, hintText, hp.x, hp.y, hp.size, hintA);
  }
  let bloomStrength = 0;
  const nextLabels = {};
  const nextDrawn = {};
  const nextScenes = {};
  CITIES.forEach((city, i) => {
    const tn = lookTint(sample(phases[i]));
    const painted = paintJar(ctx, shelf.jarRect(i), city, phases[i], tn, weathers[i], at[i], plates[i], scratch, { reduced: reduceMotion, dew: dews[i], anchor: feed.cloudAnchor(city.id), preview: i === focus ? preview : null });
    nextScenes[city.id] = painted.scene;
    nextDrawn[city.id] = { flash: flashes[i], dew: dews[i], drift: painted.drift, moon: painted.moon };
    nextLabels[city.id] = labelLines(city, weathers[i], at[i], i === focus ? preview : null);
    bloomStrength = Math.max(bloomStrength, tn.bloom);
  });
  labels = nextLabels;
  drawn = nextDrawn;
  scenes = nextScenes;
  // the forecast card of the lifted jar, riding the lift's own progress
  const pose = forecastPose(shelf.jarRect(focus), fitScreen(W, H, shelf.centreX).portrait, lift.progress(t));
  if (pose) {
    const todayHere = localDate(ms, CITIES[focus].location.zone);
    const cells = forecastCells(weathers[focus], todayHere);
    const sun = sunTimesFor(weathers[focus], todayHere);
    const sunT = sunFraction(at[focus], CITIES[focus].location.zone, sun);
    // the tide curve is today's: the dot follows the scrubbed moment while it is still today, else none
    const dayT = localDate(at[focus], CITIES[focus].location.zone) === todayHere ? dayFraction(at[focus], CITIES[focus].location.zone) : null;
    const tides = tidesFor(weathers[focus], todayHere);
    ctx.save();
    // emerge from behind the glass: nothing of the card is drawn over the jar
    const jr = shelf.jarRect(focus);
    ctx.beginPath();
    ctx.rect(-1e5, -1e5, 2e5, 2e5);
    ctx.rect(jr.x, jr.y, jr.w, jr.h);
    ctx.clip('evenodd');
    ctx.globalAlpha = pose.alpha;
    forecastCard(ctx, pose.rect, cells, pose.layout, sun, sunT, tides, dayT);
    ctx.restore();
    lastForecast = { cells, rect: pose.rect, sun, sunT, tides, dayT };
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
  if (scrubRow.hidden === lifted) scrub.show(lifted);
}

// The label is only canvas pixels, so the canvas's accessible name carries it.
let ariaText = '';
let spoken = null; // { id, text } of the lifted jar's spoken forecast last synced, null on the table
function syncAria() {
  const here = view === 'jar' ? feed.get(CITIES[focus].id) : null;
  const todayHere = view === 'jar' ? localDate(nowMs(), CITIES[focus].location.zone) : null;
  const cells = view === 'jar' ? forecastCells(here, todayHere) : null;
  const sun = view === 'jar' ? sunTimesFor(here, todayHere) : null;
  const sentence = cells ? forecastSentence(cells) : '';
  const tideText = view === 'jar' ? tideSentence(tidesFor(here, todayHere)) : '';
  const days = (sentence ? ` ${sentence}` : '') + (sun ? ` Sunrise ${sun.sunrise}, sunset ${sun.sunset}.` : '') + (tideText ? ` ${tideText}` : '');
  const c = CITIES[focus];
  const l = labels[c.id];
  const facts = l ? `${placeName(c)}, ${l[1]}, ${l[2]} local time${l.length === 4 ? `, swell ${l[3]}` : ''}` : placeName(c);
  let moonText = '';
  if (view === 'jar') {
    const at = scrubMin > 0 ? previewMs() : nowMs();
    const ph = therePhase(at, c.location, viewerAt(at));
    if (isNight(ph) && moonPos(ph).alt > 0) moonText = ` A ${moonPhase(at).name} moon.`;
  }
  const next = view === 'jar' ? { id: c.id, text: days.trim(), rev: feed.revision } : null;
  const say = forecastAnnouncement(spoken, next);
  spoken = next;
  if (say !== null) liveEl.textContent = say;
  else if (!next && liveEl.textContent) liveEl.textContent = '';
  syncValueText();
  const text = view === 'jar'
    ? `${view === 'jar' && scrubMin > 0 ? `Previewing ${offsetText(scrubMin)}: ` : ''}${facts}. The jar is lifted.${moonText}${days} Press Escape to put it back on the table.`
    : `A potting table with a glass jar of ${facts}. Press Enter to lift the jar.${hint !== 'none' ? ` ${hintSentence(hintText)}` : ''}`;
  if (text !== ariaText) {
    ariaText = text;
    canvas.setAttribute('aria-label', text);
  }
}

function setTitle() {
  document.title = view === 'jar' ? `${placeName(CITIES[focus])}, in a jar` : 'Jars';
}

// The slider's spoken value: offset, the previewed clock time and temperature,
// all taken from the previewed moment itself (never from the throttled draw).
function syncValueText() {
  let text = 'now';
  if (view === 'jar' && scrubMin > 0) {
    const c = CITIES[focus];
    const w = previewWeather(feed.get(c.id), previewMs(), c.location.zone);
    text = `${offsetText(scrubMin)}, ${localTimeText(previewMs(), c.location.zone)}, ${formatTemp(w.temperature)}`;
  }
  if (scrubEl.getAttribute('aria-valuetext') !== text) scrub.setValueText(text);
}

function setScrub(min) {
  scrubMin = clampScrub(min);
  scrub.setValue(scrubMin);
  syncValueText();
  lastKey = '';
}

function doLift(i) {
  if (i < 0 || i >= CITIES.length) return;
  focus = i;
  shelf.go(i);
  shelf.pos = shelf.target;
  view = 'jar';
  hint = hintOnLift(hint);
  setScrub(0);
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
  setScrub(0);
  pendingBack = false;
  lift.close(perf());
  setTitle();
  if (document.activeElement === backBtn || scrubRow.contains(document.activeElement)) canvas.focus();
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
  // The first Escape of a preview returns to now; the next puts the jar down.
  if (e.key === 'Escape') {
    if (scrubMin > 0) setScrub(0);
    else lowerFromUser();
  }
});
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    liftFromUser(shelf.index);
  } else if (e.key === 'ArrowRight' && view === 'table') shelf.next();
  else if (e.key === 'ArrowLeft' && view === 'table') shelf.prev();
});
backBtn.addEventListener('click', lowerFromUser);
const scrub = new ScrubBar(scrubEl, document.getElementById('now'), { onChange: (min) => setScrub(min) });
const scrubRow = scrubEl.parentElement;
document.getElementById('prev').addEventListener('click', () => shelf.prev());
document.getElementById('next').addEventListener('click', () => shelf.next());

// Pointer: a short press lifts the jar under it; a drag slides the row.
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  if (view === 'jar') {
    if (e.button !== 0) return; // a right-click or a pen's barrel button is not a press
    // a press outside the lifted jar and its card puts the jar back, like Back
    if (lift.moving) return;
    // the band kept free for the slider row never lowers the jar
    if (!scrubRow.hidden && e.clientY >= scrubRow.getBoundingClientRect().top) return;
    const s = cssToScene(e.clientX, e.clientY);
    if (pressLowers(s, shelf.jarRect(focus), lastForecast && lastForecast.rect)) lowerFromUser();
    return;
  }
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
  // Preview the lifted jar `min` minutes ahead (snapped to the slider's step);
  // returns the clamped value. Only the lifted jar moves.
  scrub(min) {
    setScrub(min);
    render(true);
    return scrubMin;
  },
  get scrubMin() { return scrubMin; },
  // null at now, else the focused jar's previewed moment and weather.
  get preview() {
    if (view !== 'jar' || scrubMin === 0) return null;
    const c = CITIES[focus];
    const w = previewWeather(feed.get(c.id), previewMs(), c.location.zone);
    return { ms: previewMs(), offsetMin: scrubMin, kind: w.kind, temperature: w.temperature };
  },
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
  get cadence() { return { weather: weatherCadence, cities: cityCadences }; },
  scene: (id) => scenes[id] || null,
  drift: (id) => (drawn[id] ? drawn[id].drift : 0),
  moon: (id) => (drawn[id] ? drawn[id].moon : null),
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
  // Canvas-pixel position of a body-share point (bx of the width, by of the
  // body height) of jar `id`.
  bodyPx(id, bx, by) {
    const r = shelf.jarRect(CITIES.findIndex((c) => c.id === id));
    const body = bodyRect();
    return this.toCanvas(r.x + r.w * bx, r.y + r.h * ((body.y + by * body.h) / JAR.h));
  },
  foot(id) {
    const r = shelf.jarRect(CITIES.findIndex((c) => c.id === id));
    return this.toCanvas(r.x + r.w / 2, r.y + r.h);
  },
  // The rect of jar `id` in canvas px, like forecast.rect (test surface only).
  jarBox(id) {
    const r = shelf.jarRect(CITIES.findIndex((c) => c.id === id));
    const a = this.toCanvas(r.x, r.y);
    const b = this.toCanvas(r.x + r.w, r.y + r.h);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  },
  // The forecast card last drawn: null on the table, else { cells, rect, sun, sunT, tides, dayT } in canvas px.
  get forecast() {
    if (!lastForecast) return null;
    const r = lastForecast.rect;
    const a = this.toCanvas(r.x, r.y);
    const b = this.toCanvas(r.x + r.w, r.y + r.h);
    return { cells: lastForecast.cells, sun: lastForecast.sun, sunT: lastForecast.sunT, tides: lastForecast.tides, dayT: lastForecast.dayT, rect: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } };
  },
  // The chalk hint: null once gone, else { text, state, alpha, rect } with the lettering's box in canvas px.
  get hint() {
    if (hint === 'none') return null;
    const p = lift.progress(perf());
    const hp = hintPose(fitScreen(W, H, shelf.centreX).cx);
    const half = chalkWidth(ctx, hintText, hp.size) / 2;
    const a = this.toCanvas(hp.x - half, hp.y - hp.size / 2);
    const b = this.toCanvas(hp.x + half, hp.y + hp.size / 2);
    return { text: hintText, state: hint, alpha: hintAlpha(hint, p), rect: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } };
  },
  get dpr() { return dpr; },
  get ambient() { return lastShedAmbient; },
  get framing() { return fitScreen(W, H, shelf.centreX); },
};

fit();
feed.start();
if (opts.jar && CITIES.some((c) => c.id === opts.jar)) {
  const i = CITIES.findIndex((c) => c.id === opts.jar);
  hint = initialHint(true);
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
