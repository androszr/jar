// Adapted from Memory Lane (vir-sunset) tools/serve.mjs, 2026-10-18
// A tiny static file server for src/, on node:http, with no dependencies, that
// also routes GET /api/weather to the same handler Vercel runs.
// `npm run serve` -> http://localhost:5173 (PORT=... to change it).
// Every response carries the headers vercel.json gives it in production (the
// CSP, the robots tag and the rest), so a rule that would break the live page
// breaks it here first; only caching differs: local dev never caches.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/weather.js';

const ROOT = resolve(fileURLToPath(new URL('../src', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const HOSTING = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

// The merged headers of every vercel.json rule whose `source`, read as a whole
// regex, matches the path; names lower-cased, a later rule overrides an
// earlier one's key (which is how the `.js`/`.css` rule narrows the catch-all's
// Cache-Control). The sources are kept to forms path-to-regexp and RegExp read
// the same way (`/(.*)`, `/(.*)\.(js|css)`) for exactly this reading.
export function headersFor(pathname) {
  const out = {};
  for (const rule of HOSTING.headers || []) {
    if (!new RegExp(`^${rule.source}$`).test(pathname)) continue;
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

export function startServer({ port = 5173, host = '127.0.0.1', root = ROOT, fetchImpl = globalThis.fetch } = {}) {
  const server = createServer(async (req, res) => {
    const plain = (pathname, extra = {}) => ({
      ...headersFor(pathname), 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra,
    });
    // A static page answers reads only.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, plain('/', { allow: 'GET, HEAD' })).end('method not allowed');
      return;
    }
    // A malformed address (`/%E0%A4%A`) is the client's mistake: answer 400,
    // never let decodeURIComponent's URIError take the server down.
    let url;
    let path;
    try {
      url = new URL(req.url, 'http://localhost');
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, plain('/')).end('bad request');
      return;
    }

    // The weather function, the one non-static route.
    if (url.pathname === '/api/weather') {
      const wrap = {
        method: req.method,
        setHeader: (k, v) => res.setHeader(k, v),
        end: (b) => res.end(b),
        set statusCode(c) { res.statusCode = c; },
      };
      for (const [k, v] of Object.entries(headersFor('/api/weather'))) res.setHeader(k, v);
      await handler(req, wrap, { fetchImpl });
      return;
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403, plain(url.pathname)).end('forbidden');
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        ...headersFor(url.pathname),
        'content-type': TYPES[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, plain(url.pathname)).end('not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok({ server, port: server.address().port }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 5173;
  // Dev only: WEATHER_FIXTURE=<path> answers the vendor call from that file, so a
  // storm or a fog can be seen on demand. Read once here from this process's
  // own environment; no request ever reaches it.
  let fetchImpl;
  if (process.env.WEATHER_FIXTURE) {
    const text = readFileSync(resolve(process.env.WEATHER_FIXTURE), 'utf8');
    fetchImpl = async () => new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
    console.log(`Weather is answered from ${process.env.WEATHER_FIXTURE}`);
  }
  startServer({ port, ...(fetchImpl ? { fetchImpl } : {}) }).then(({ port: p }) => {
    console.log(`Jar is being served at http://localhost:${p}  (Ctrl+C to stop)`);
  }, (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${port} is taken. Stop the other server or set PORT=...` : err.message);
    process.exit(1);
  });
}
