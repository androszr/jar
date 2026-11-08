import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forecastAnnouncement, UPDATED } from '../src/announce.js';

const w = (text, id = 'warsaw') => ({ id, text });

test('quiet on the table and on the lift itself', () => {
  assert.equal(forecastAnnouncement(null, null), null);
  assert.equal(forecastAnnouncement(w('x'), null), null);
  assert.equal(forecastAnnouncement(null, w('Next five days: a.')), null);
});

test('quiet for a different jar, identical text, or a blank forecast', () => {
  assert.equal(forecastAnnouncement(w('a'), w('b', 'nazare')), null);
  assert.equal(forecastAnnouncement(w('a'), w('a')), null);
  assert.equal(forecastAnnouncement(w('a'), w('')), null);
});

test('speaks a changed forecast, including the first answer after a lift', () => {
  assert.equal(forecastAnnouncement(w(''), w('Next five days: X.')), `${UPDATED} Next five days: X.`);
  const next = w('Next five days: b. Sunrise 07:00, sunset 16:30.');
  const say = forecastAnnouncement(w('Next five days: a.'), next);
  assert.equal(say, `${UPDATED} ${next.text}`);
  assert.ok(say.includes('Sunrise'));
  assert.ok(forecastAnnouncement(w('a'), w('b')));
  assert.ok(forecastAnnouncement(w('b'), w('a')));
  assert.equal(UPDATED, 'Weather updated.');
});

test('the live region is in the markup, empty, and not hidden', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.equal(html.split('aria-live="polite"').length - 1, 1);
  const m = html.match(/<[^>]*aria-live="polite"[^>]*>([^<]*)<\/[a-z]+>/);
  assert.ok(m);
  assert.ok(m[0].includes('id="announce"') && m[0].includes('aria-atomic="true"'));
  assert.ok(!/\bhidden\b(?!-)/.test(m[0].replace('visually-hidden', '')));
  assert.equal(m[1], '');
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = css.match(/\.visually-hidden\s*{[^}]*}/)[0];
  assert.ok(rule.includes('clip-path'));
  assert.ok(!rule.includes('display: none'));
});

test('quiet when only the clock moved: same feed revision, shifted day names', () => {
  const a = { id: 'warsaw', text: 'Next five days: Mon 4 to 1.', rev: 7 };
  const b = { id: 'warsaw', text: 'Next five days: Tue 5 to 2.', rev: 7 };
  assert.equal(forecastAnnouncement(a, b), null);
  assert.equal(forecastAnnouncement(a, { ...b, rev: 8 }), `${UPDATED} ${b.text}`);
});
