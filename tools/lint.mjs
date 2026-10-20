// Adapted from Memory Lane (vir-sunset) tools/lint.mjs, 2026-10-18
// Lint: every script parses (`node --check`), and the page keeps its house
// rules: colour literals only in the look's palette and a city's own palette,
// the look named in one place, the browser talking only to its own origin,
// every city folder registered, the weather function canvas-free, and none of
// Memory Lane's print vocabulary in the page.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
}) : []);
const rel = (f) => relative(ROOT, f).split(sep).join('/');

const problems = [];
const scripts = ['src', 'api', 'tools', 'test'].flatMap((d) => walk(join(ROOT, d))).filter((f) => /\.(m?js)$/.test(f));
for (const file of scripts) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${rel(file)} does not parse:\n${r.stderr.trim()}`);
}

const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
const PALETTES = /^src\/(look\/[^/]+\/palette\.js|cities\/[^/]+\/palette\.js)$/;
const PRINT = /Printer|Painter|halftone|INK_NAMES/;
const OFF_ORIGIN = /\bfetch\s*\(\s*['"`]\s*(https?:|\/\/)/;
for (const file of walk(join(ROOT, 'src'))) {
  const r = rel(file);
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    if (/\.(js|css)$/.test(r) && !PALETTES.test(r) && COLOUR.test(line)) {
      problems.push(`${r}:${i + 1} has a colour literal; colours live in src/look/<look>/palette.js or src/cities/<id>/palette.js`);
    }
    if (PRINT.test(line)) problems.push(`${r}:${i + 1} uses Memory Lane's print vocabulary; none of its look belongs here`);
    if (OFF_ORIGIN.test(line)) problems.push(`${r}:${i + 1} fetches an absolute address; the browser talks only to its own origin`);
  });
}
for (const gone of ['src/print.js', 'src/palette.js']) {
  if (existsSync(join(ROOT, gone))) problems.push(`${gone} exists; it belongs to Memory Lane's look`);
}

// The look is named in one place, and the re-export points at the same folder.
const lookIndex = existsSync(join(ROOT, 'src/look/index.js')) ? readFileSync(join(ROOT, 'src/look/index.js'), 'utf8') : '';
const look = lookIndex.match(/export const LOOK = '([^']+)'/)?.[1];
if (!look) problems.push("src/look/index.js has no `export const LOOK = '<name>'`");
else {
  if (!existsSync(join(ROOT, 'src/look', look))) problems.push(`LOOK is '${look}' but src/look/${look}/ does not exist`);
  if (!lookIndex.includes(`export * from './${look}/index.js'`)) {
    problems.push(`src/look/index.js must re-export './${look}/index.js', the folder LOOK names`);
  }
}

// Every city folder is registered in the registry and in places.js.
const CITIES_DIR = join(ROOT, 'src/cities');
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '');
const registry = read('src/cities/index.js');
const places = read('src/cities/places.js');
if (!registry) problems.push('src/cities/index.js is missing; it is the registry of cities');
if (!places) problems.push('src/cities/places.js is missing');
if (existsSync(CITIES_DIR)) {
  for (const id of readdirSync(CITIES_DIR)) {
    if (!statSync(join(CITIES_DIR, id)).isDirectory()) continue;
    if (!registry.includes(`./${id}/index.js`)) {
      problems.push(`src/cities/${id}/ is not listed in src/cities/index.js; import ./${id}/index.js and add it to CITIES`);
    }
    if (!places.includes(`id: '${id}'`)) {
      problems.push(`src/cities/${id}/ is not listed in src/cities/places.js; add an entry with id '${id}'`);
    }
  }
}

// api/ stays canvas-free: from src/ it may import only cities/places.js and weather.js.
for (const file of walk(join(ROOT, 'api'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = rel(join(file, '..', spec));
    if (target.startsWith('src/') && !['src/cities/places.js', 'src/weather.js'].includes(target)) {
      problems.push(`${rel(file)} imports ${target}; api/ may import only src/cities/places.js and src/weather.js`);
    }
  }
}

// Provenance on the three copied clock modules.
for (const f of ['src/clock.js', 'src/realclock.js', 'src/placeclock.js']) {
  if (!read(f).includes('Adapted from Memory Lane')) problems.push(`${f} lacks the "Adapted from Memory Lane" provenance header`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\nlint: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`lint: ${scripts.length} scripts parse; no colour literals outside the palettes; the look is named once; no off-origin fetch; every city is registered`);
