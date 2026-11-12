// The people on the shore: one hiker who spends the day on the rock, and the
// visitors who come and go around them. Pure, canvas-free: every figure is a
// function of the moment and the place's own sunrise and sunset, so the same
// moment puts the same people in the same spots.
//
// Nobody appears or vanishes in view. A visitor walks in from an edge of the
// glass, sits or stands a few minutes facing the wall, and walks out again. The
// hiker ambles in after sunrise and, round sunset, stands, climbs down and
// leaves in stages, looking back at the wall between them.
import { sunTimes } from '../../realclock.js';
import { zoneOffsetMinutes } from '../../placeclock.js';
import { hash2 } from '../../skyweather.js';
import { ROCK } from './scene.js';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;

export const WALK_SPEED = 0.011; // jar widths a second
export const STRIDE = 0.017; // jar widths to one full stride: the gait follows the ground covered
export const WALK_TICK_MS = 100; // the redraw tick a walking figure asks for
const OFF = 0.07; // how far past the glass a walk starts and ends
const LANE = 0.708; // where feet pass in front of the rock

// Seats on the rock: the hiker's own, in the middle, and one beside it for a visitor.
export const SEAT = { x: (ROCK.x0 + ROCK.x1) / 2, y: ROCK.y + 0.002 };
export const SEAT_2 = { x: ROCK.x0 + 0.037, y: ROCK.y + 0.004 };
// Up and down the rock's two shoulders.
const ROCK_RIGHT = [[ROCK.x1 + 0.012, LANE], [ROCK.x1 - 0.026, ROCK.y + 0.005]];
const ROCK_LEFT = [[ROCK.x0 - 0.012, LANE], [ROCK.x0 + 0.022, ROCK.y + 0.007]];

// The hiker's day, in minutes from the sun: the leaving starts HIKER_STANDS
// before sunset and is over HIKER_GONE after it; the arriving mirrors it after
// sunrise. The span is longer than one step of the preview slider, so a preview
// stepped through the evening always catches the hiker on the way out.
export const HIKER_STANDS = 14;
export const HIKER_GONE = 30;
export const HIKER_SPAN_MS = (HIKER_STANDS + HIKER_GONE) * MIN_MS;
// where the hiker stops to look back, and when (minutes after sunset) each stop ends
const LOOK_BACKS = [{ x: 0.8, until: 4 }, { x: 0.868, until: 15 }, { x: 0.918, until: 26 }];
const STANDS_FOR_MS = 6 * MIN_MS; // on the rock, on their feet, before climbing down

// Visitors keep clear of the two ends of the day: none until VISITORS_AFTER
// minutes past sunrise, all gone VISITORS_BEFORE minutes before sunset.
export const VISITORS_AFTER = 45;
export const VISITORS_BEFORE = 16;
// One visit at a time per place. `period` seconds is one turn; `lag` seconds
// lets a companion follow the one whose turn (`with`) it shares.
export const PLACES = [
  { x: SEAT_2.x, y: SEAT_2.y, rock: true, period: 560, shift: 130 },
  { x: 0.185, y: 0.706, period: 430, shift: 0 },
  { x: 0.365, y: 0.707, period: 510, shift: 215, stands: true },
  { x: 0.47, y: 0.724, period: 610, shift: 340 },
  { x: 0.845, y: 0.706, period: 380, shift: 90, stands: true },
  { x: 0.262, y: 0.722, period: 690, shift: 470 },
  { x: 0.292, y: 0.723, period: 690, shift: 470, with: 5, lag: 3.2 },
  { x: 0.555, y: 0.712, period: 470, shift: 20 },
];
// The share of turns somebody takes: fewer in the cold half of the year.
export const BUSY = { summer: 0.5, spring: 0.42, autumn: 0.36, winter: 0.18 };

const lengthOf = (pts) => {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
};
// The point `d` along a path, and which way it is heading there (-1 left, 1 right).
function along(pts, d) {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (left <= seg || i === pts.length - 1) {
      const t = seg ? Math.min(1, left / seg) : 1;
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, dir: x1 >= x0 ? 1 : -1 };
    }
    left -= seg;
  }
  return { x: pts[0][0], y: pts[0][1], dir: 1 };
}
const walking = (pts, d) => ({ ...along(pts, d), pose: 'walk', step: d / STRIDE });

// The sun's rise and set (ms) for the day the last sunrise began, or null for
// an unknown zone or moment.
export function sunWindow(nowMs, location) {
  if (!location || typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  const offset = zoneOffsetMinutes(nowMs, location.zone);
  if (offset === null) return null;
  const day = Math.floor((nowMs - offset * MIN_MS) / DAY_MS);
  for (const d of [day + 1, day, day - 1]) {
    const { rise, set } = sunTimes(d, location.lat, location.lon);
    const at = d * DAY_MS + rise * HOUR_MS;
    if (at <= nowMs) return { rise: at, set: d * DAY_MS + set * HOUR_MS };
  }
  return null;
}

// ---- the hiker ---------------------------------------------------------------
// The way out: off the right shoulder of the rock and along the shore to the right.
const WAY_OUT = [[SEAT.x, SEAT.y], [ROCK_RIGHT[1][0], ROCK_RIGHT[1][1]], [ROCK_RIGHT[0][0], ROCK_RIGHT[0][1]], [1 + OFF, LANE]];
const OUT_STOPS = (() => {
  // distance along WAY_OUT at which each look-back stands
  const base = lengthOf(WAY_OUT.slice(0, 3));
  return LOOK_BACKS.map((s) => ({ d: base + (s.x - WAY_OUT[2][0]), until: (HIKER_STANDS + s.until) * 60 }));
})();
// The hiker `s` seconds into leaving: standing on the rock, then walk and look back by turns.
function leaving(s) {
  let t = STANDS_FOR_MS / 1000;
  if (s < t) return { x: SEAT.x, y: SEAT.y, pose: 'stand', dir: 1, step: 0 };
  let d = 0;
  for (const stop of OUT_STOPS) {
    const arrive = t + (stop.d - d) / WALK_SPEED;
    if (s < arrive) return walking(WAY_OUT, d + (s - t) * WALK_SPEED);
    if (s < stop.until) return { ...along(WAY_OUT, stop.d), pose: 'stand', dir: -1, step: 0 };
    d = stop.d;
    t = Math.max(arrive, stop.until);
  }
  const far = d + (s - t) * WALK_SPEED;
  return far >= lengthOf(WAY_OUT) ? null : walking(WAY_OUT, far);
}

// The hiker at `nowMs`: null when away. The morning is the evening run backwards.
export function hikerAt(nowMs, sun) {
  if (!sun) return null;
  const { rise, set } = sun;
  const base = { id: 'hiker', look: -1 };
  if (nowMs < rise) return null;
  if (set - rise < 2 * HIKER_SPAN_MS) return null; // too short a day to walk in and out
  if (nowMs < rise + HIKER_SPAN_MS) {
    const f = leaving((rise + HIKER_SPAN_MS - nowMs) / 1000);
    return f && { ...base, ...f, dir: f.pose === 'walk' ? -f.dir : f.dir, step: -f.step };
  }
  const out = set - HIKER_STANDS * MIN_MS;
  if (nowMs < out) return { ...base, x: SEAT.x, y: SEAT.y, pose: 'sit', dir: 1, step: 0, rock: true };
  const f = leaving((nowMs - out) / 1000);
  return f && { ...base, ...f };
}

// ---- the visitors ------------------------------------------------------------
const pathTo = (place, side) => {
  const edge = side < 0 ? -OFF : 1 + OFF;
  if (!place.rock) return [[edge, place.y], [place.x, place.y]];
  // always up the left shoulder, so nobody steps over the hiker
  return [[edge, LANE], ROCK_LEFT[0], ROCK_LEFT[1], [place.x, place.y]];
};

// Who is at place `i` at `nowMs`, or null. `busy` is the share of turns taken.
export function visitorAt(i, nowMs, sun, busy = BUSY.summer) {
  const place = PLACES[i];
  if (!place || !sun) return null;
  const lead = PLACES[place.with ?? i];
  const lag = place.lag || 0;
  const period = lead.period * 1000;
  const shifted = nowMs + lead.shift * 1000;
  const turn = Math.floor(shifted / period);
  const start = turn * period - lead.shift * 1000;
  // the whole turn fits inside the visitors' day, or nobody takes it
  if (start < sun.rise + VISITORS_AFTER * MIN_MS || start + period > sun.set - VISITORS_BEFORE * MIN_MS) return null;
  const seed = (place.with ?? i) * 97 + 13;
  if (hash2(turn, seed) >= busy) return null;
  const from = hash2(turn, seed + 1) < (place.x < 0.5 ? 0.7 : 0.3) ? -1 : 1;
  const to = hash2(turn, seed + 2) < 0.75 ? from : -from; // most go back the way they came
  const way = pathTo(place, from);
  const back = pathTo(place, to).reverse();
  const tIn = lengthOf(way) / WALK_SPEED;
  const tOut = lengthOf(back) / WALK_SPEED;
  const s = (shifted - turn * period) / 1000 - 4 - hash2(turn, seed + 3) * 18 - lag;
  const leave = lead.period - 30 - tOut - 4;
  const who = { id: i, look: Math.floor(hash2(turn, seed + 4 + i) * 1000), rock: !!place.rock };
  if (s < 0 || tIn + 30 > leave) return null;
  if (s < tIn) return { ...who, ...walking(way, s * WALK_SPEED) };
  if (s < leave + lag * 2) {
    const stands = !place.rock && (place.stands || hash2(turn, seed + 5) < 0.25);
    return { ...who, x: place.x, y: place.y, pose: stands ? 'stand' : 'sit', dir: -1, step: 0 };
  }
  const d = (s - leave - lag * 2) * WALK_SPEED;
  return d >= lengthOf(back) ? null : { ...who, ...walking(back, d) };
}

// Everybody on the shore at `nowMs`, the furthest first: the hiker and the visitors.
export function shoreFolk(nowMs, location, season = 'summer') {
  const sun = sunWindow(nowMs, location);
  if (!sun) return [];
  const folk = [];
  const hiker = hikerAt(nowMs, sun);
  if (hiker) folk.push(hiker);
  for (let i = 0; i < PLACES.length; i++) {
    const v = visitorAt(i, nowMs, sun, BUSY[season] ?? BUSY.summer);
    if (v) folk.push(v);
  }
  return folk.sort((a, b) => a.y - b.y);
}

export const inView = (f) => f.x > -0.02 && f.x < 1.02;
