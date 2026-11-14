import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStandalone, capabilities, Lantern } from '../src/lantern.js';

// ---- fakes ---------------------------------------------------------------------
function bus() {
  const map = new Map();
  return {
    addEventListener(t, f) { (map.get(t) || map.set(t, new Set()).get(t)).add(f); },
    removeEventListener(t, f) { map.get(t)?.delete(f); },
    dispatchEvent(e) { for (const f of [...(map.get(e.type) || [])]) f(e); return true; },
  };
}

function world({ wakeLock = true, fullscreen = true, standalone = false, iosStandalone = false, reject = false } = {}) {
  const counts = { lockRequests: 0, released: 0, fullscreenRequests: 0, exits: 0 };
  const sentinels = [];
  const document = {
    ...bus(),
    visibilityState: 'visible',
    fullscreenElement: null,
    fullscreenEnabled: true,
    documentElement: {},
    exitFullscreen: async () => { counts.exits++; document.fullscreenElement = null; },
  };
  if (fullscreen) {
    document.documentElement.requestFullscreen = async () => {
      counts.fullscreenRequests++;
      document.fullscreenElement = document.documentElement;
    };
  }
  const navigator = iosStandalone ? { standalone: true } : {};
  if (wakeLock) {
    navigator.wakeLock = {
      request: async () => {
        counts.lockRequests++;
        await Promise.resolve();
        if (reject) throw new Error('NotAllowedError');
        const s = { ...bus(), release: async () => { counts.released++; s.dispatchEvent({ type: 'release' }); } };
        sentinels.push(s);
        return s;
      },
    };
  }
  const matchMedia = (q) => ({ matches: standalone && q === '(display-mode: standalone)' });
  const lantern = new Lantern({ document, navigator, matchMedia });
  return { document, navigator, matchMedia, lantern, counts, sentinels };
}

// ---- isStandalone / capabilities ---------------------------------------------------
test('isStandalone is true for display-mode: standalone', () => {
  assert.equal(isStandalone({ matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }), navigator: {} }), true);
});

test('isStandalone is true for navigator.standalone', () => {
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true);
});

test('isStandalone is false otherwise, and false when matchMedia is missing or throws', () => {
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} }), false);
  assert.equal(isStandalone({ navigator: {} }), false);
  assert.equal(isStandalone({}), false);
  assert.equal(isStandalone({ matchMedia: () => { throw new Error('old browser'); }, navigator: {} }), false);
});

test('capabilities reports both false when the APIs are absent', () => {
  assert.deepEqual(capabilities({ document: { documentElement: {} }, navigator: {} }), { fullscreen: false, wakeLock: false });
  assert.deepEqual(capabilities({}), { fullscreen: false, wakeLock: false });
  const w = world();
  assert.deepEqual(capabilities(w), { fullscreen: true, wakeLock: true });
  w.document.fullscreenEnabled = false;
  assert.equal(capabilities(w).fullscreen, false);
});

// ---- the mode ------------------------------------------------------------------------
test('a fresh non-standalone lantern is off with an idle lock', () => {
  const { lantern } = world();
  assert.equal(lantern.on, false);
  assert.equal(lantern.lock, 'idle');
  assert.equal(lantern.standalone, false);
});

test('enter() requests fullscreen once and the lock once', async () => {
  const { lantern, counts } = world();
  lantern.attach();
  await lantern.enter();
  assert.equal(lantern.on, true);
  assert.equal(counts.fullscreenRequests, 1);
  assert.equal(counts.lockRequests, 1);
  assert.equal(lantern.lock, 'held');
});

test('leave() releases the sentinel and exits fullscreen', async () => {
  const { lantern, counts, document } = world();
  lantern.attach();
  await lantern.enter();
  await lantern.leave();
  assert.equal(lantern.on, false);
  assert.equal(counts.released, 1);
  assert.equal(counts.exits, 1);
  assert.equal(document.fullscreenElement, null);
  assert.equal(lantern.lock, 'idle');
});

test('toggle() flips the mode', async () => {
  const { lantern } = world();
  lantern.attach();
  await lantern.toggle();
  assert.equal(lantern.on, true);
  await lantern.toggle();
  assert.equal(lantern.on, false);
});

test('hiding the page releases the lock and showing it asks again', async () => {
  const { lantern, counts, document } = world();
  lantern.attach();
  await lantern.enter();
  document.visibilityState = 'hidden';
  document.dispatchEvent({ type: 'visibilitychange' });
  await Promise.resolve();
  assert.equal(counts.released, 1);
  assert.equal(lantern.lock, 'idle');
  document.visibilityState = 'visible';
  document.dispatchEvent({ type: 'visibilitychange' });
  await lantern.holdLock();
  assert.equal(counts.lockRequests, 2);
  assert.equal(lantern.lock, 'held');
});

test('a hidden page never asks for the lock', async () => {
  const { lantern, counts, document } = world();
  lantern.attach();
  document.visibilityState = 'hidden';
  await lantern.enter();
  assert.equal(counts.lockRequests, 0);
});

test('a standalone page is on at construction and attach() holds the lock without fullscreen', async () => {
  const { lantern, counts } = world({ standalone: true });
  assert.equal(lantern.on, true);
  assert.equal(lantern.standalone, true);
  lantern.attach();
  await lantern.holdLock();
  assert.equal(counts.lockRequests, 1);
  assert.equal(counts.fullscreenRequests, 0);
  assert.equal(lantern.lock, 'held');
});

test('with no wake lock the mode still enters fullscreen', async () => {
  const { lantern, counts } = world({ wakeLock: false });
  lantern.attach();
  await lantern.enter();
  assert.equal(lantern.on, true);
  assert.equal(counts.fullscreenRequests, 1);
  assert.equal(lantern.lock, 'unsupported');
});

test('with no requestFullscreen the mode still holds the lock', async () => {
  const { lantern, counts } = world({ fullscreen: false });
  lantern.attach();
  await lantern.enter();
  assert.equal(lantern.on, true);
  assert.equal(counts.lockRequests, 1);
  assert.equal(lantern.lock, 'held');
});

test('a rejected request leaves the lock denied and the mode on, without throwing', async () => {
  const { lantern } = world({ reject: true });
  lantern.attach();
  await lantern.enter();
  assert.equal(lantern.lock, 'denied');
  assert.equal(lantern.on, true);
});

test('leaving fullscreen the usual way turns the mode off and releases', async () => {
  const { lantern, counts, document } = world();
  lantern.attach();
  await lantern.enter();
  document.fullscreenElement = null;
  document.dispatchEvent({ type: 'fullscreenchange' });
  assert.equal(lantern.on, false);
  await Promise.resolve();
  assert.equal(counts.released, 1);
  assert.equal(lantern.lock, 'idle');
});

test('fullscreenchange does nothing to a standalone page', async () => {
  const { lantern, document } = world({ standalone: true });
  lantern.attach();
  await lantern.holdLock();
  document.dispatchEvent({ type: 'fullscreenchange' });
  assert.equal(lantern.on, true);
});

test('two overlapping enter() calls hold one sentinel', async () => {
  const { lantern, counts, sentinels } = world();
  lantern.attach();
  await Promise.all([lantern.enter(), lantern.enter()]);
  assert.equal(counts.lockRequests, 1);
  assert.equal(sentinels.length, 1);
});

test("the sentinel's own release event puts the lock back to idle", async () => {
  const { lantern, sentinels } = world();
  lantern.attach();
  await lantern.enter();
  sentinels[0].dispatchEvent({ type: 'release' });
  assert.equal(lantern.lock, 'idle');
  assert.equal(lantern.on, true);
});

test('detach removes both listeners', async () => {
  const { lantern, counts, document } = world();
  const detach = lantern.attach();
  await lantern.enter();
  detach();
  document.visibilityState = 'hidden';
  document.dispatchEvent({ type: 'visibilitychange' });
  document.fullscreenElement = null;
  document.dispatchEvent({ type: 'fullscreenchange' });
  assert.equal(counts.released, 0);
  assert.equal(lantern.on, true);
});

// A world whose fullscreen and wake-lock requests settle only when the test says so.
function slowWorld() {
  const w = world();
  const gates = { fullscreen: null, lock: null };
  const late = (name) => new Promise((ok) => { gates[name] = ok; });
  w.document.documentElement.requestFullscreen = () => late('fullscreen').then(() => {
    w.counts.fullscreenRequests++;
    w.document.fullscreenElement = w.document.documentElement;
  });
  w.navigator.wakeLock.request = () => late('lock').then(() => {
    w.counts.lockRequests++;
    const s = { ...bus(), release: async () => { w.counts.released++; s.dispatchEvent({ type: 'release' }); } };
    w.sentinels.push(s);
    return s;
  });
  return { ...w, gates };
}

test('leave() while the fullscreen request is pending leaves the page out of fullscreen', async () => {
  const { lantern, document, gates, counts } = slowWorld();
  lantern.attach();
  const entering = lantern.enter();
  await lantern.leave();
  gates.fullscreen();
  await entering;
  assert.equal(lantern.on, false);
  assert.equal(document.fullscreenElement, null);
  assert.equal(counts.exits, 1);
  assert.equal(counts.lockRequests, 0);
});

test('leave() while the wake-lock request is pending does not hold the display awake', async () => {
  const { lantern, gates, counts } = slowWorld();
  lantern.attach();
  const entering = lantern.enter();
  await Promise.resolve(); await Promise.resolve();
  gates.fullscreen();
  while (!gates.lock) await Promise.resolve();
  await lantern.leave();
  gates.lock();
  await entering;
  assert.equal(lantern.on, false);
  assert.equal(lantern.lock, 'idle');
  assert.equal(counts.released, 1);
});

test('a page hidden while the wake-lock request is pending does not keep the sentinel', async () => {
  const { lantern, document, gates, counts } = slowWorld();
  lantern.attach();
  const entering = lantern.enter();
  gates.fullscreen();
  while (!gates.lock) await Promise.resolve();
  document.visibilityState = 'hidden';
  gates.lock();
  await entering;
  assert.equal(counts.released, 1);
  assert.notEqual(lantern.lock, 'held');
});

test('a rejection landing after leave() does not mark the lock denied', async () => {
  const w = world();
  let fail;
  w.navigator.wakeLock.request = () => new Promise((_, no) => { fail = no; });
  w.lantern.attach();
  const entering = w.lantern.enter();
  while (!fail) await Promise.resolve();
  await w.lantern.leave();
  fail(new Error('NotAllowedError'));
  await entering;
  assert.equal(w.lantern.on, false);
  assert.equal(w.lantern.lock, 'idle');
});
