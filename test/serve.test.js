// Adapted from Memory Lane (vir-sunset) test/serve.test.js, 2026-10-18
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { startServer } from '../tools/serve.mjs';
import { resetMemo } from '../api/weather.js';

beforeEach(() => resetMemo());

// One raw request to the dev server; resolves to { status, headers, body }.
function ask(port, path, method = 'GET') {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

test('the dev server answers bad addresses and methods without falling over', async () => {
  const { server, port } = await startServer({ port: 0 });
  try {
    assert.equal((await ask(port, '/%E0%A4%A')).status, 400, 'a malformed escape is a 400');
    assert.equal((await ask(port, '/%')).status, 400);
    const post = await ask(port, '/', 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    assert.equal((await ask(port, '/index.html', 'DELETE')).status, 405);
    assert.equal((await ask(port, '/..%2F..%2Fpackage.json')).status, 403, 'traversal stays refused');
    assert.equal((await ask(port, '/no-such-file.js')).status, 404);
    // Still alive after all of that, and still serving the page.
    const home = await ask(port, '/');
    assert.equal(home.status, 200);
    assert.match(home.body, /<html/i);
    const head = await ask(port, '/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('the dev server never caches, whatever vercel.json says', async () => {
  const { server, port } = await startServer({ port: 0 });
  try {
    for (const p of ['/', '/main.js']) {
      const r = await ask(port, p);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers['cache-control'], 'no-store', `${p} is cached in dev`);
      assert.ok((r.headers['content-security-policy'] || '').startsWith("default-src 'self'"), `${p}: no CSP`);
    }
  } finally {
    await new Promise((done) => server.close(done));
  }
});

const stubFetch = (calls, mode = 'ok') => async (url) => {
  calls.push(String(url));
  if (mode === 'throw') throw new Error('vendor down');
  return {
    ok: true,
    json: async () => JSON.parse(readFileSync(new URL('./fixtures/weather.json', import.meta.url), 'utf8')),
  };
};

test('GET /api/weather answers the tidy body from one stubbed vendor call', async () => {
  const calls = [];
  const { server, port } = await startServer({ port: 0, fetchImpl: stubFetch(calls) });
  try {
    const r = await ask(port, '/api/weather');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /application\/json/);
    const body = JSON.parse(r.body);
    assert.equal(body.v, 1);
    assert.equal(body.cities.warsaw.temperature, 12.3);
    assert.equal(calls.length, 1, 'one vendor call for every city');
    assert.match(calls[0], /^https:\/\/api\.open-meteo\.com\//);
    assert.match(calls[0], /latitude=52\.23&longitude=21\.01/);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('GET /api/weather carries the cache header and the production security headers', async () => {
  const { server, port } = await startServer({ port: 0, fetchImpl: stubFetch([]) });
  try {
    const r = await ask(port, '/api/weather');
    assert.equal(r.headers['cache-control'], 'public, max-age=0, s-maxage=900');
    assert.ok((r.headers['content-security-policy'] || '').startsWith("default-src 'self'"));
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('POST /api/weather is a 405, and the vendor is never asked', async () => {
  const calls = [];
  const { server, port } = await startServer({ port: 0, fetchImpl: stubFetch(calls) });
  try {
    const r = await ask(port, '/api/weather', 'POST');
    assert.equal(r.status, 405);
    assert.equal(calls.length, 0);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('a throwing vendor makes /api/weather a 502 with the empty shape and no caching', async () => {
  const { server, port } = await startServer({ port: 0, fetchImpl: stubFetch([], 'throw') });
  try {
    const r = await ask(port, '/api/weather');
    assert.equal(r.status, 502);
    const body = JSON.parse(r.body);
    assert.deepEqual([body.v, body.ok, body.cities], [1, false, {}]);
    assert.equal(r.headers['cache-control'], 'no-store');
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('the request is never read: a query string changes nothing the vendor sees', async () => {
  const calls = [];
  const { server, port } = await startServer({ port: 0, fetchImpl: stubFetch(calls) });
  try {
    await ask(port, '/api/weather?latitude=0&longitude=0');
    assert.match(calls[0], /latitude=52\.23/);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('a malformed request target is a 400 or a closed connection, and the server keeps answering', async () => {
  const { server, port } = await startServer({ port: 0, fetchImpl: stubFetch([]) });
  try {
    const reply = await new Promise((ok) => {
      const sock = connect(port, '127.0.0.1', () => sock.write('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
      let got = '';
      sock.on('data', (d) => { got += d; });
      sock.on('close', () => ok(got));
      sock.on('error', () => ok(got));
    });
    assert.ok(reply === '' || /^HTTP\/1\.1 400/.test(reply), reply);
    assert.equal((await ask(port, '/')).status, 200, 'still serving');
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('a fetchImpl answering from a fixture file reaches /api/weather with its wind', async () => {
  const text = readFileSync(new URL('./fixtures/weather.json', import.meta.url), 'utf8');
  const fetchImpl = async () => new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
  const { server, port } = await startServer({ port: 0, fetchImpl });
  try {
    const r = await ask(port, '/api/weather');
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).cities.warsaw.windSpeed, 18.4);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
