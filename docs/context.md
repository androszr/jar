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
`src/look/<LOOK>/` (`palette.js`, `light.js`, `draw.js`). An unseen lamp above the table warms the wall above the jars (`lampWash` in `src/look/lantern/light.js`, two additive glows whose strength is `0.07 + 0.13 * (1 - ambient)`, painted before the pane is cut so the sky is never tinted) and lays a sheen on the table; a linen curtain hangs at the window's left (`curtain`), the back shelf is `backShelf`, each jar stands on a `contactShadow` with a short `reflection`, and the window moon's x is clamped to 0.32..0.8 of the pane so it clears the cloth. Every room colour stays in `palette.js`; the static art is cached per `tintBucket`. **B Toybox** (bright
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
Praga) is the first, and one jar is one city. `CITIES = [warsaw, nazare, elChalten]`: Nazaré
(`Europe/Lisbon`, a `tin` lid) is the second, the Sítio headland with the São Miguel
Arcanjo fort and lighthouse above the Praia do Norte wave, its size set by the real swell, and by the hour's forecast swell while the scrub is ahead of now (`src/cities/nazare/sea.js`, rolls stretched 1.5x by `ROLL_STRETCH` so waves come less often:
calm under 1 m, moderate 1-3, big 3-6, giant 6+, 2 m with no reading), surfers by day and a beam by night. The sea reads as water: seven swell lines march in toward the beach (faint on a calm day, pronounced on a giant one, paced by the same roll), the breaking wave has a shaded face with a drifting foam trail behind it, foam lace fringes the sand, and the spray and the crest's spindrift lean with the wind through `windPush`, all dimmed at night and slowed under reduced motion.
The headland's own life is `src/cities/nazare/cliff.js`: scrub on the cliff top leaning with the wind, a switchback path with lamps at night, rock that darkens after a wave hits (`rockWet`), boards and a door (lit at night) on the fort wall, a crowd on the roof sized by the swell band (`spectatorCount`: 0/3/7/12, halved in bad weather, none in the dark), three gulls by day in fair weather and a safety jet ski outside the break on big and giant days; `scene('nazare')` also reports `spectators`, `gulls` and `rescue`.
El Chaltén (`America/Argentina/Rio_Gallegos`, a `cork` lid) is the third: Fitz Roy seen from the east shore of Laguna de los Tres, looking west, with no town in it. The weather picks one of four visibility bands in `src/cities/el-chalten/massif.js` (clear, smoking, capped, hidden; named thresholds on cloud, weather kind and wind, `clear` with no reading) and the city's `labelLine` prints it as the label's fourth line (`FITZ ROY · SMOKING`, none without a reading); `sky: { sun: false }` declines the shared sun disc because the sun never rises in frame; granite is faceted geometry built once from a seed in `buildPlates` and shaded by the hour; the near ground is a narrow stony lip of moraine below the lake (`GRAVEL.y0`), darkening towards the viewer, with faceted boulders at the waterline, low stones where people walk and big blocks in the foreground, all built once in `buildShore`; the people on the shore are a pure function of the moment and the place's own sunrise and sunset in `src/cities/el-chalten/tourists.js` (`shoreFolk`): one hiker who ambles in after sunrise, sits on the rock all day and, from 14 minutes before sunset, stands, climbs down and walks off to the right in stages (a span longer than one preview step, with a headlamp once the light is low), and visitors who walk in from an edge, sit or stand facing the wall and walk out again, fewer in the cold seasons; nobody appears or vanishes in view, and a walking figure asks for a 100 ms tick through the city's `cadenceMs`; `scene('el-chalten')` reports `{ band, plume, glow, mirror, frozen, headlamps, hiker, tourists, condor, season }`.
Warsaw's scene began as the *Floodlit Nocturne* (plan `plans/2026-10-19-warsaw-floodlit-nocturne.md`) and is now the skyline seen from the Praga bank (2026-11-08): Varso and a sandstone Palace (shaft, pinnacle combs, brass needle, two clocks; floodlit gold by night, white over red on 3 May and 11 November by `flagDay`) on the left, the cluster to the right, a band of low lit city, the narrow river above the label plate carrying faint sandstone and pale-glass reflections by day and the coloured ones by night (ice floes drifting right from `iceAmount` below −5 °C, full at −12, Warsaw declaring `cadenceMs` 250 ms / 500 reduced only then), the far bank's boulevard with its lamps, the near bank only forest (its canopy follows Warsaw's date through `seasonWeights`, a three-week fade at each season start: fresh green in spring, deep green in summer, gold and rust in autumn, bare grey-brown with dark twigs in winter, summer when the date cannot be read), the Świętokrzyski Bridge (`src/cities/warsaw/bridge.js`) from the far quay into that forest, and a small Mermaid on the far quay beside the bridgehead; after dark small white and red lights moving along the deck, driven by `nowMs` (Warsaw declares `cadenceMs` 200 ms, 400 reduced, which also carries the ice); the glass streaks of every jar sit at the glass edges (`STREAKS` in `src/look/lantern/draw.js`). The Vistula's reflections are soft vertical ripples: a column of thin lens-shaped dashes under each lit thing (Palace, Varso, towers, red aviation light, boulevard lamps), in its own colour, narrowing and fading downward and swaying with `nowMs` (still under reduced motion).

**Weather path.** browser -> `/api/weather` (own origin) -> `api/weather.js`
-> Open-Meteo `api.open-meteo.com`, one request for every city, tidied to
`{ v: 1, fetchedAt, ok, cities: { id: { temperature, code, cloudCover, isDay, windSpeed, windDir, daily: [{ date, code, high, low, sunrise, sunset, rainChance, windMax, windMaxDir }], hourly: [{ time, temperature, code, cloudCover, isDay, windSpeed, windDir }], sea: { waveHeight, wavePeriod, waveDir, daily: [{ date, waveHeightMax, wavePeriodMax, tides: [{ time, kind, height }] }], hourly: [{ time, waveHeight }] } | null } } }`
(`sea.hourly` is up to 120 hours of wave height from the hour of the sea reading (the marine request carries one `hourly=wave_height,sea_level_height_msl` list over all five days and no `forecast_hours`, which would cut today's earlier tides; the tide times are the extremes of the sea level, `time` the vendor's local ISO `YYYY-MM-DDTHH:MM`, `[]` when the vendor leaves it out); each city likewise carries `hourly` weather rows (the next 120 hours, `forecast_hours=120` on the weather request, the vendor's local ISO `time` read only through `wallToMs(time, zone)`, `[]` when the vendor leaves it out), and the lifted jar's scrub previews both through `previewWeather` (`src/scrub.js`);
(`sea` is read from `marine-api.open-meteo.com` in the same function, in parallel, only for a place that carries an offshore `sea` point; a failed or missing marine answer is `sea: null` and never fails the weather, and the page draws a 2 m default sea; a city may print a fourth label line through its own `labelLine(weather)`: Nazaré's is `formatSwell`, El Chaltén's the view of the peak; Nazaré's card a peak wave height per day, both absent without a reading)
(`daily` is five days in the city's own zone and feeds the forecast card shown when a jar is lifted, which prints under each day the chance of rain (`rainChance`, %) and the day's strongest wind with an arrow the way it blows to (`windMax` km/h, `windMaxDir` degrees it comes from; a missing figure is simply not drawn), marks today's cell (brass band, brighter day name and an underline under the name; the canvas's accessible sentence says `today` before that day) and prints today's sunrise and sunset as `HH:MM` in the city's zone (`sunrise`/`sunset` are `null` and the strip is omitted when the vendor leaves them out; a second strip for a seaside city prints today's high and low tide times (`tides`, found by `tideExtremes` in `api/weather.js` from the marine hourly `sea_level_height_msl` in the city's own wall clock; `[]` when the sea is missing, and the tide times are spoken too; each time carries its height in metres, and a small tide curve from `tideCurve` under the strip marks `dayFraction(ms, zone)` (`src/placeclock.js`) with a dot; a tide without a height prints its time alone and with fewer than two heights there is no curve), and a thin brass arc under the strips carries a sun dot at `sunFraction(ms, zone, sun)` (`src/placeclock.js`) of the way from sunrise to sunset, dim and dotless outside daylight);
`windSpeed` km/h and `windDir` degrees the wind comes from are `null` when the vendor leaves them out,
and lean the rain and snow through `windSlant`). Storms flash on `flashIntensity`'s code-keyed schedule
(`src/weather.js`, softened under reduced motion). `WeatherFeed` holds a session-only `fogClearedAt` map,
noted when an answer turns a city from fog to anything else; `dewSince` feeds 45 minutes of dew droplets on
the glass, and nothing is persisted, so a reload forgets it.
Cached 15 minutes at the edge (`s-maxage=900`) and 15 minutes in the page
(`WeatherFeed` refetches only while the tab is visible, and keeps the last good
answer on any failure for up to 45 minutes — `STALE_MS`, three refreshes, measured
by the feed's own clock from when the answer was accepted — after which `get`
answers `EMPTY` until the next good answer; it counts from receipt, not from the body's `fetchedAt`, so with the edge cache a reading can be up to an hour old before the dash). A failed attempt is tried again soon: the function asks the weather vendor twice (4 s each, the marine call once) and logs one line per failed call, with the reason and never the address; the page tries again after 5, 15, 30 and 60 s (`RETRY_MS`, `dueAt`) before it falls back to the 15-minute schedule; and the function runs in Frankfurt (`regions: ["fra1"]` in `vercel.json`), next to the vendor's servers (2026-11-13: for some minutes every call from the US East region timed out while the vendor answered from Europe). Locally `tools/serve.mjs` routes the same handler;
tests and the smoke check inject a stub, so nothing touches the network.

**Heavy sky and the 2026-11-12 look pass.** `gloom(weather)` (`src/weather.js`) is how heavy the sky is, 0..1 (nothing for no reading, a clear sky or broken cloud; a full overcast 0.7, fog 0.45, snow 0.6, drizzle 0.75, rain 0.9, a storm 1): `paintInterior` greys the sky with the look's `overcastSky`, drains and dims the scene under it with `gloomWash` (less at night, so lamps keep their colour) and the shared sun fades with it; clouds take `cloudColour` (grey when heavy, warm at a low sun, `lowSun`); rain is a far and a near layer, snow round flakes in three depths, and a storm draws the look's `bolt` along `boltPath` (one shape per flash period; a city's `sky: { strike: [x, y] }` takes it on every other period — Warsaw names the Palace needle). The same pass redrew each scene, and where this file's older sentences disagree the code wins: Warsaw's near bank is rows of tree crowns over a strip of beach with two path lamps at night (`src/cities/warsaw/forest.js`), the glass towers carry the sky, the Palace has one dim clock, the bridge has a shaded pylon, a deck with a railing and daytime traffic, the river soft reflections with a sun path and a moon track, and `src/cities/warsaw/life.js` holds the boat, birds, windows going out through the night, frost steam, the New Year fireworks (31 Dec 23:55 to 1 Jan 00:20) and the Christmas tree (6 Dec to 6 Jan); `scene('warsaw')` reports `{ season, golden, windows, glitter, moonTrack, wet, boat, birds, steam, vehicles, lamps, fireworks, tree }`. Nazaré declines the shared sun and draws its own (`src/cities/nazare/sun.js`), which sets into the sea; the wave has a banded face, a pitching lip and spindrift and a 10 m crest reaches the cliff top; the cliff is lit strata with runnels after a hit; the lighthouse is a squat white base under a red lantern; sand runs to the bottom of the jar (`src/cities/nazare/beach.js`, umbrellas only on warm fair calm-to-moderate days, a red flag on big and giant ones); boat lights sit on the night horizon; `scene('nazare')` adds `sun`, `boats`, `umbrellas`, `flag`. El Chaltén's wall stands taller with its spires over a hanging glacier, alpenglow creeps down from the tips, the evening backlights the wall, the hidden band keeps the near ground under a ragged cloud base with a brief ghost of the wall, and `src/cities/el-chalten/air.js` holds the night sky (Milky Way, Southern Cross, moon track), plume, lens cloud, spindrift and cloud deck.

**Rain and snow in two layers.** `drawPrecipitation(ctx, rect, weather, nowMs, layer)` (`src/skyweather.js`) paints `'far'` (a fine slow curtain, and the far snow specks) with the sky, behind the city, and `paintInterior` (`src/jar.js`) paints `'near'` after `city.paint`, so the weather falls in front of the sea and the land and not only in the sky. A city whose scene covers the whole sky (El Chaltén) paints `'far'` again itself; no city paints `'near'`. Each streak has its own length and speed. A bead on the glass leaves a short tail (`BEAD_TAIL`), not a line from where it started.

**Frame cost.** Three things keep a frame cheap (`src/main.js`). Behind a fully lifted jar the room is not repainted every frame: `backdrop` leaves the softened room in `scratch.back`, and `backdropKept` draws it again until something in the room changes (`roomKey`: the feed, the minute, the shelf, a flash, a fade, the hint) or `ROOM_BEHIND_MS` has passed; a jar behind the lifted one gives up its bloom as the lift completes. A jar's own light (`measure`, a pixel read-back that makes the page wait for the graphics card) is read every `LIGHT_MS`, the jars in turn, and at once when its sky, moment or size changes. The look's full-screen upscales (`backdrop`, `backdropKept`, `bloom`) use `imageSmoothingQuality = 'medium'`: `'high'` cost about 60 ms a frame on a 2x screen.

**Clocks.** `src/clock.js` (nine keyframes, `sample(p)` -> `{ light, a, b, t }`),
`src/realclock.js` (sunrise/sunset maths -> the drawn phase), `src/placeclock.js`
(a city's zone offset, `therePhase`, `localTimeText`), all copied from Memory
Lane and credited in their headers. The shed window follows the **viewer's**
phase (`realPhase`); each jar follows **its city's** phase (`therePhase`).
The moon's phase is `moonPhase(nowMs)` in `src/moon.js` (mean synodic month from the 2000-01-06 18:14 UTC new moon; `{ fraction, illumination, waxing, name }`); every moon — jar skies, the shed window, Nazaré's track — is drawn through the look's `moonDisc` and scaled by `moonGlow`, so a new moon is a faint dark disc and no track.
Clouds drift by `cloudDrift` (`src/weather.js`): the wind's east-west push from `windPush`, the same
one that leans the rain, carried by `cloudTravel` from a per-city anchor, `WeatherFeed.cloudAnchor(id)` (`nextCloudAnchor`): a page's first reading starts from the shared origin (`NO_ANCHOR`, whatever its `fetchedAt`, so every page holding the same answer agrees), a changed wind re-anchors at the moment it lands carrying the old travel, so a new reading changes the pace and never the position (anchors are session memory like `fogClearedAt`, nothing persisted); slowed to 0.4 under reduced motion and
wrapped through a margin of twice each cloud's radius. A windy cloudy jar redraws on a 250 ms tick, calm cloud
keeps the once-a-minute key, precipitation its 50 ms one; a city may declare `cadenceMs(weather, { reduced, nowMs })` (Nazaré's rolling sea: 100 ms, 250 reduced) and the page ticks at the smallest positive of the weather's and every city's (`window.__jar.cadence` is `{ weather, cities }`, `scene(id)` what a scene's `paint` returned); `window.__jar.drift(id)` and `cadenceMs` are the test surface.

**Views.** `view` is `'table'` or `'jar'`. Click/tap lifts a jar
(`src/lift.js`, 0.8 s glide), Escape / `#back` / browser Back sets it down;
the address remembers it as `?jar=<id>` (`src/address.js`). A wide screen shows
the whole scene; a taller one a full-height slice centred on the focused jar
(`src/framing.js`) — one code path branching on aspect. A table opened without `?jar=` carries a chalk hint on a small slate lying on the table (`src/hint.js`, drawn by the look's `chalk`) reading "tap a jar" on a coarse pointer and "click a jar" otherwise; it fades with the first lift and is session memory like `fogClearedAt`, nothing persisted. `window.__jar` is the
test surface. The canvas's `aria-label` is the lifted jar's spoken description; because the lift moves focus to `#back`, a polite live region `#announce` (`src/index.html`, written only by `syncAria` through `forecastAnnouncement` in `src/announce.js`) says `Weather updated.` plus the forecast and sun sentence when a refresh changes them for the jar that stays lifted — never on the lift, a jar switch, identical numbers, a blank forecast, the minute tick or the day names shifting at local midnight (the announcement is keyed on `feed.revision`). `#credit` is a fixed top-right link to `https://open-meteo.com/` ("Weather data by Open-Meteo", Open-Meteo's CC BY 4.0 credit), shown in both views, one line down to about 390 px wide and two lines beside `#back` on a narrower phone, and styled from `CSS_VARS`; `main.js` passes the credit's measured box (`creditBox`, taken in `fit()`) and the slider row's height to `liftCamera`, which leaves the lifted picture exactly where it was unless it would come within `CREDIT_MARGIN` of the credit, and then slides it down (and shrinks it if need be) into the band between the credit and the slider row; `window.__jar.jarBox(id)` is its smoke seam.

**Light, glass and the room (2026-11-12).** A frame is two passes: every diorama is first painted into its own interior canvas (`paintInterior` in `src/jar.js`) and measured, then the jars are stood on the table (`placeJar`), so each jar's light is known before anything it falls on is drawn: its colour on the wall behind it, a sheen on the side of the jar next to it, and a storm's flash across the room (never on the sky in the pane). The shed's art carries a bleed (`BLEED` in `src/shed.js`, 480 x 160 scene units, the canvas capped by `artScale`) so a wider or taller screen and a lifted camera show wall and table, never the bare page. The glass (`glassHighlights`) has a wall, a thick base, a shoulder highlight, the lid's shadow and a thread; clouds are one filled shape each (`cloud`); the sun is `sunDisc` under two glows; stars are round, with a rare `shootingStar(nowMs)`; rain leaves rings on a city's `water(rect, scene)` (`drawSplashes`) and beads on the glass (`drawRainOnGlass`). The bloom takes only the bright parts of a jar (`brights`: the interior times the square of its own lightness); a fixed grain tile (`grainTile`, `GRAIN`) lies over the frame; dust (`motes`), a moth after dark (`moth`) and each lantern's `lanternFlicker` give the room a 200 ms tick (`cadence.room`, 0 under reduced motion). A lifted jar's interior is painted at `interiorQuality` (2 to 4 px per unit) so a dense screen is not shown a stretched picture.

**What the viewer sets going.** All of it is state held in `src/main.js` and handed to the draw functions as plain numbers, so the same inputs paint the same picture (convention 4): a pointer over a jar (`hover`, the hand cursor, a glint on the glass); where the viewer stands (`parallax`, the pointer on a desk and `deviceorientation` on a phone that reports it without asking leave; the diorama slides by `interiorShift`, the highlights the other way); the lift's rise (`liftRise` in `src/lift.js`: the jar hangs `LIFT_RISE` 30 units above the table, overshooting a little, its shadow and pool of light staying on the wood) while the room behind softens and dims (`backdrop`); a press on the lifted glass (`shakeAt` in `src/shake.js`: 2.6 s of lean, slosh and a flurry, snow when it is cold); a press on a day of the card (`dayPreviewMin` in `src/scrub.js`: that day's 13:00, ringed on the card, the label reading `13:00 (+2 d 5 h)` through `offsetLabel`; the same day again, today's cell or Escape returns to now; the weather function now carries 120 hourly rows for it); the `play` button beside the slider (the next 24 hours in 20 s, an hour at a time under reduced motion; `stop`, Escape or the slider ends it); a new reading that changes a sky fading in over 2.5 s (`src/fade.js`); and the opening moment (`src/intro.js`: the room comes up, then the jars light left to right; not on a `?jar=` link). Under reduced motion there is no shake, parallax, fade or opening. Under automation (`navigator.webdriver`) the page holds still too, and the smoke check drives each through its seam: `__jar.shake()`, `.parallax(x, y)`, `.intro()`, `.applyWeather(body, { fade: true })`, `.previewDay(i)`, `.play()`.

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
