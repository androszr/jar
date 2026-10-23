# jar

A garden shed at night. On the potting table stands a glass jar glowing like a
lantern, and inside it a tiny Warsaw: the downtown cluster (Varso, the Palace of
Culture and Science, Warsaw Spire, Złota 44) with the Mermaid in front, lit
for the real time of day in Warsaw right now, under the weather Warsaw is
really having, with a small label on the glass giving the city, the
temperature and the local time. Click or tap the jar and it lifts closer, and a small card shows the next five days, with today marked and the sunrise and sunset. Escape or the
back button sets it down. The shed's window follows your own clock.

One static page, Canvas 2D and ES modules, no build step, no runtime
libraries, everything drawn in code. One small Vercel Node function
(`api/weather.js`) fetches the weather. The clock logic is adapted from Memory
Lane (`../vir-sunset`), and credited in the file headers; no visual code is.

## Quick start

```
npm install
npm run serve        # http://localhost:5173 (PORT=... to change it)
# WEATHER_FIXTURE=test/fixtures/weather-storm.json npm run serve   # dev only: answer the weather from a file
#   (weather-hail.json, weather-fog.json, weather-nowind.json are the others); in a fog page, run
#   __jar.applyWeather({"current":{"temperature_2m":9,"weather_code":0,"cloud_cover":5,"is_day":1}}) in the console to see dew
```

The local server also answers `GET /api/weather` with the real function, which
asks Open-Meteo (no key needed).

## URL options

- `?jar=<id>` opens straight onto that jar, lifted (`?jar=warsaw`).
- `?day=`, `?at=`, `?clock=` are parsed by `readOptions` for a later card; the
  page always runs on the real clocks.

## Gates

```
npm run lint                      # syntax + house rules (tools/lint.mjs)
npm test                          # unit tests (node --test)
SMOKE_TIMING=off npm run smoke    # headless Chromium; drop SMOKE_TIMING=off to hold frame budgets
```

The smoke check needs a Chromium: `npx playwright-core install chromium-headless-shell`
(or an installed Chrome, which it falls back to). The weather vendor is stubbed
everywhere in tests and the smoke check; nothing touches the network.

## The look

The visual direction is **Lantern**, named in exactly one place:
`src/look/index.js` (`export const LOOK = 'lantern'`). Every colour, lighting
rule and drawing primitive lives under `src/look/lantern/`. To switch looks,
add `src/look/<name>/` exporting the same surface (the list is in
`src/look/index.js` and checked by `test/look.test.js`) and change the constant
and the `export * from` line. The other candidates are **Toybox** (bright
isometric, flat-shaded low-poly) and **Pixel** (cosy pixel-art diorama).

## Adding a city

1. Add `{ id, title, lat, lon, zone }` to `src/cities/places.js`.
2. Copy `src/cities/warsaw/` to `src/cities/<id>/`, write its `palette.js` and
   scene, and fill in `index.js` (the contract is the comment at the top of
   `src/cities/index.js`).
3. Import it and add it to `CITIES` in `src/cities/index.js`.

`npm run lint` fails if a city folder is in only one of the two registries.

## Hosting

`vercel.json` publishes `src/` as it is and gives every response a self-only
CSP (`connect-src 'self'`); `/api/*` is cached 15 minutes at the edge. Deploys
run from `.github/workflows/deploy.yml` after the gates, with a pinned Vercel
CLI; the Vercel project and its three secrets (`VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) are yours to create.

See `docs/context.md` for the architecture and the house rules.
