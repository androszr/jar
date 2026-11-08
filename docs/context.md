<!-- BEGIN DARK ARMY PACK — managed, edits here are overwritten -->
# Project context — jar

Ground truth for every agent in `.claude/agents/`. Read this first, before
exploring the tree. If something here contradicts the code, the code wins —
say so in your report rather than silently working around it.

Three sections here are read by machinery, not only by people, so keep their
shape: the **Identity** table (gates), the **Reviewers** table (which domain
reviewer fires on which paths) and the **Conventions** list (what the
preflight, the verifier and the reviewers enforce).

This file has been filled in by the project (2026-10-18, plan
`plans/2026-10-18-shed-of-city-jars.md`). Dark Army keeps it in step with its
agent pack only until the project edits it: from the first edit on, a resync
leaves the whole file alone. To take a newer template later, delete the file
and resync. `test/context.test.js` fails if the Identity table is ever
replaced by the template.

## Identity

| Field | Value |
|---|---|
| `src_dir` | `src/` |
| Framework | Static page, Canvas 2D + ES modules, no build step, plus one Vercel Node function under `api/` |
| Package manager | npm (Node 22), `playwright-core` dev-only |
| `lint_gate` | `npm run lint` |
| `typecheck_gate` | `n/a` (plain JavaScript, no type checker) |
| `test_gate` | `npm test` |
| `build_gate` | `npm run smoke` |
| Plans | `plans/<YYYY-MM-DD>-<slug>.md` |
| Scout reports | `scout/<YYYY-MM-DD>-<slug>/report.md` |
| Manual checks | `manual-check/<YYYY-MM-DD>-<slug>/check.md` |
| Reference docs | `README.md`, `vercel.json`, `src/look/index.js`, `src/cities/index.js` |

**Every gate must pass before any handoff.** Run them in the order listed —
the fast ones fail first. Agents read the commands from this table; none of
them hardcodes one. `npm run smoke` drives headless Chromium through
`playwright-core`; set `SMOKE_TIMING=off` where the machine cannot hold a
frame budget (CI does).

## Reviewers

One row per domain reviewer. `/ship` Phase 6.8 greps the changed-file list
against each regex and spawns every reviewer that matches; `/review --deep`
hands the diff to the first one. The regex is a floor — a reviewer is also
spawned on judgment when the diff touches its domain through other files.

| Agent | Fires when a changed path matches |
|---|---|
| `jar-security-reviewer` | `^api/|tools/serve\.mjs|index\.html|package\.json|package-lock\.json|vercel\.json|\.env|fetch\(|XMLHttpRequest|WebSocket|localStorage|postMessage` |
| `jar-integration-reviewer` | `^api/|package\.json|package-lock\.json|\.github/workflows/|^tools/|vercel\.json|index\.html` |

## Architecture

**Entry chain.** `src/index.html` loads `src/main.js` (a module, no inline
script or style: the CSP is self-only). `main.js` boots the shed
(`src/shed.js`), the row of jars (`src/shelf.js`), the weather feed
(`src/weatherfeed.js`) and a render loop that redraws only when its render
key changes. A 1600x1000 logical scene is drawn on one `#view` canvas.

**The look (decision 2026-10-18, plan shed-of-city-jars).** The visual
direction is **Lantern (A)**, chosen by that plan: a dark moody shed, jars
glowing from within, soft gradients, bloom, light spilling onto the table,
monospace instrument labels. It is named once, in `src/look/index.js`
(`LOOK`), and every colour, lighting rule and drawing primitive lives under
`src/look/<LOOK>/` (`palette.js`, `light.js`, `draw.js`). **B Toybox** (bright
isometric, faceted low-poly, saturated pastels, grotesk labels) and **C
Pixel** (cosy pixel-art diorama, nearest-neighbour upscaled) are the recorded
alternatives; each is a new folder under `src/look/` that exports the required
surface (`test/look.test.js` lists it) plus the two-line switch in
`src/look/index.js`. Nothing from Memory Lane's print look (`Printer`,
`Painter`, halftone, the ink plates) exists in this page; lint forbids it.

**Registry.** `src/cities/index.js` (`CITIES`, `findCity`) and
`src/cities/places.js` (`PLACES`, plain data so `api/weather.js` can import it
in Node). A city is a folder `src/cities/<id>/` with `index.js`, its own
`palette.js` and its scene; adding one is the folder plus one entry in each
registry (lint fails an unlisted folder). The contract is the comment at the
top of `src/cities/index.js`. Warsaw (the downtown cluster — Varso, the
Palace of Culture and Science, Warsaw Spire, Złota 44 — seen across the Vistula from
Praga) is the first, and one jar is one city. `CITIES = [warsaw, nazare]`: Nazaré
(`Europe/Lisbon`, a `tin` lid) is the second, the Sítio headland with the São Miguel
Arcanjo fort and lighthouse above the Praia do Norte wave, its size set by the real swell (`src/cities/nazare/sea.js`:
calm under 1 m, moderate 1-3, big 3-6, giant 6+, 2 m with no reading), surfers by day and a beam by night.
Warsaw's scene began as the *Floodlit Nocturne* (plan `plans/2026-10-19-warsaw-floodlit-nocturne.md`) and is now the skyline seen from the Praga bank (2026-11-08): Varso and a sandstone Palace (shaft, pinnacle combs, brass needle, two clocks; floodlit gold by night, white over red on 3 May and 11 November by `flagDay`) on the left, the cluster to the right, a band of low lit city, the narrow river above the label plate, the far bank's boulevard with its lamps, the near bank only forest, the Świętokrzyski Bridge (`src/cities/warsaw/bridge.js`) from the far quay into that forest, and a small Mermaid on the far quay beside the bridgehead; the glass streaks of every jar sit at the glass edges (`STREAKS` in `src/look/lantern/draw.js`).

**Weather path.** browser -> `/api/weather` (own origin) -> `api/weather.js`
-> Open-Meteo `api.open-meteo.com`, one request for every city, tidied to
`{ v: 1, fetchedAt, ok, cities: { id: { temperature, code, cloudCover, isDay, windSpeed, windDir, daily: [{ date, code, high, low, sunrise, sunset }], sea: { waveHeight, wavePeriod, waveDir, daily: [{ date, waveHeightMax, wavePeriodMax }] } | null } } }`
(`sea` is read from `marine-api.open-meteo.com` in the same function, in parallel, only for a place that carries an offshore `sea` point; a failed or missing marine answer is `sea: null` and never fails the weather, and the page draws a 2 m default sea; the Nazaré label prints `formatSwell` as a fourth line and its card a peak wave height per day, both absent without a reading)
(`daily` is five days in the city's own zone and feeds the forecast card shown when a jar is lifted, which marks today's cell (brass band, brighter day name and an underline under the name; the canvas's accessible sentence says `today` before that day) and prints today's sunrise and sunset as `HH:MM` in the city's zone (`sunrise`/`sunset` are `null` and the strip is omitted when the vendor leaves them out; a thin brass arc under the strip carries a sun dot at `sunFraction(ms, zone, sun)` (`src/placeclock.js`) of the way from sunrise to sunset, dim and dotless outside daylight);
`windSpeed` km/h and `windDir` degrees the wind comes from are `null` when the vendor leaves them out,
and lean the rain and snow through `windSlant`). Storms flash on `flashIntensity`'s code-keyed schedule
(`src/weather.js`, softened under reduced motion). `WeatherFeed` holds a session-only `fogClearedAt` map,
noted when an answer turns a city from fog to anything else; `dewSince` feeds 45 minutes of dew droplets on
the glass, and nothing is persisted, so a reload forgets it.
Cached 15 minutes at the edge (`s-maxage=900`) and 15 minutes in the page
(`WeatherFeed` refetches only while the tab is visible, and keeps the last good
answer on any failure for up to 45 minutes — `STALE_MS`, three refreshes, measured
by the feed's own clock from when the answer was accepted — after which `get`
answers `EMPTY` until the next good answer). Locally `tools/serve.mjs` routes the same handler;
tests and the smoke check inject a stub, so nothing touches the network.

**Clocks.** `src/clock.js` (nine keyframes, `sample(p)` -> `{ light, a, b, t }`),
`src/realclock.js` (sunrise/sunset maths -> the drawn phase), `src/placeclock.js`
(a city's zone offset, `therePhase`, `localTimeText`), all copied from Memory
Lane and credited in their headers. The shed window follows the **viewer's**
phase (`realPhase`); each jar follows **its city's** phase (`therePhase`).
The moon's phase is `moonPhase(nowMs)` in `src/moon.js` (mean synodic month from the 2000-01-06 18:14 UTC new moon; `{ fraction, illumination, waxing, name }`); every moon — jar skies, the shed window, Nazaré's track — is drawn through the look's `moonDisc` and scaled by `moonGlow`, so a new moon is a faint dark disc and no track.
Clouds drift by `cloudDrift` (`src/weather.js`): the wind's east-west push from `windPush`, the same
one that leans the rain, carried by `cloudTravel` from a per-city anchor, `WeatherFeed.cloudAnchor(id)` (`nextCloudAnchor`): a page's first reading starts from the shared origin (`NO_ANCHOR`, whatever its `fetchedAt`, so every page holding the same answer agrees), a changed wind re-anchors at the moment it lands carrying the old travel, so a new reading changes the pace and never the position (anchors are session memory like `fogClearedAt`, nothing persisted); slowed to 0.4 under reduced motion and
wrapped through a margin of twice each cloud's radius. A windy cloudy jar redraws on a 250 ms tick, calm cloud
keeps the once-a-minute key, precipitation its 50 ms one; a city may declare `cadenceMs(weather, { reduced })` (Nazaré's rolling sea: 100 ms, 250 reduced) and the page ticks at the smallest positive of the weather's and every city's (`window.__jar.cadence` is `{ weather, cities }`, `scene(id)` what a scene's `paint` returned); `window.__jar.drift(id)` and `cadenceMs` are the test surface.

**Views.** `view` is `'table'` or `'jar'`. Click/tap lifts a jar
(`src/lift.js`, 0.8 s glide), Escape / `#back` / browser Back sets it down;
the address remembers it as `?jar=<id>` (`src/address.js`). A wide screen shows
the whole scene; a taller one a full-height slice centred on the focused jar
(`src/framing.js`) — one code path branching on aspect. `window.__jar` is the
test surface. The canvas's `aria-label` is the lifted jar's spoken description; because the lift moves focus to `#back`, a polite live region `#announce` (`src/index.html`, written only by `syncAria` through `forecastAnnouncement` in `src/announce.js`) says `Weather updated.` plus the forecast and sun sentence when a refresh changes them for the jar that stays lifted — never on the lift, a jar switch, identical numbers, a blank forecast or the minute tick.

**Hosting.** `vercel.json` publishes `src/` as it is (`framework: null`, Git
deploys off, deploys by `.github/workflows/deploy.yml` with a pinned CLI in
`.github/vercel-cli/`); `api/weather.js` runs beside it as a Node function.
The CSP is self-only with `connect-src 'self'`.

## Conventions

The project's own non-negotiables. Each is enforced by a preflight check, a
verifier grep or a domain reviewer; a plan that breaks one is a plan that will
not pass. The planner reads these before writing, the implementer before
coding.

1. **Colour literals only in palettes.** `src/look/<look>/palette.js` and
   `src/cities/<id>/palette.js` are the only files allowed `#hex`, `rgb(`,
   `rgba(`, `hsl(`. *(lint, verifier grep)*
2. **The look is one module.** No file outside `src/look/` defines a gradient
   colour, a font or a glow, and `LOOK` is named in one place. *(lint, look
   test)*
3. **The browser talks only to its own origin.** Every vendor call lives under
   `api/`, `connect-src` stays `'self'`, and there is no `fetch(` of an
   absolute URL in `src/`. *(lint, hosting test, security reviewer)*
4. **Same moment, same picture.** Every mover is a function of `phase` or of
   the `nowMs` passed in, never of `Math.random` or a wall-clock read inside a
   draw function. *(smoke determinism check)*
5. **Both shells, same pass.** Laptop and phone change together, branching on
   aspect in code, never CSS-hiding a duplicate tree. *(preflight BLOCK)*
6. **Weather is optional.** Every jar paints and every label reads with
   `EMPTY` weather. *(smoke degrade check)*
7. **Every city folder is in both registries** (`index.js` and `places.js`).
   *(lint)*
8. **Transported shapes are forward-compatible.** The weather body carries
   `v`, unknown keys are ignored, missing keys default to `null`; nothing is
   written to storage. *(api tests)*
9. **Never commit or push** unless explicitly asked.
10. **One jar is one city.** A second view of a city is a change to that city's
    scene, never a second jar. *(planner; `test/cities.test.js`)*

## What the tests cannot see

The suite is hermetic. Green proves nothing about these surfaces, which is why
the domain reviewers exist:

- **The real vendor.** Open-Meteo's live shape and availability: the fixtures
  are frozen and the smoke check stubs the route; the vendor is not.
- **The deployed headers.** CSP, HSTS and the cache rules are config, and only
  observable on a live URL.
- **The real Vercel function runtime.** The handler is run in Node by the dev
  server; whether Vercel honours the `vercel.json` or the function's own
  `cache-control` is only visible deployed.
- **Real-phone feel.** The lift glide, the swipe and the frame rate on a real
  device; the smoke check emulates touch in desktop Chromium.
- **Whether the look reads as intended.** A glowing lantern on a dark table is
  a judgement about a screen.

## Interview branches

`/ship` asks at most three questions from `.claude/skills/ship/templates/questions.md`.
Branches that the architecture above already settles should be answered from
this file rather than asked. Settled here: the look is Lantern (do not ask
which style); the stack is plain Canvas 2D with no build step (do not ask
about frameworks); weather comes through `api/weather.js` only; a new city is
a folder plus one line in each registry.
<!-- END DARK ARMY PACK -->
