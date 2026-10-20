// Adapted from Memory Lane (vir-sunset) test/context.test.js, 2026-10-18
// docs/context.md's Identity table is where every agent brief and the
// planner read the gate commands from. A Dark Army pack resync once
// replaced it with the profile template (pnpm and Next.js rows this
// project does not have). These tests fail the moment that happens again,
// and say how to put it back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CONTEXT = join(ROOT, 'docs/context.md');
const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
const text = () => readFileSync(CONTEXT, 'utf8');

const RESYNC = 'A Dark Army pack resync has probably overwritten the Identity table in '
  + 'docs/context.md with its template; restore the table from git '
  + '(git show HEAD:docs/context.md) and keep the project rows.';

// A value is judged by its first backtick span when it has one, so
// "`n/a` (plain JavaScript, no type checker)" reads as "n/a".
const cellValue = (cell) => {
  const span = cell.match(/^`([^`]*)`/);
  return span ? span[1] : cell;
};

const identityRows = (doc) => {
  const start = doc.indexOf('## Identity');
  if (start === -1) return [];
  const end = doc.indexOf('\n## ', start + 1);
  const section = doc.slice(start, end === -1 ? undefined : end);
  const rows = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\| `?([^`|]+?)`? \| (.*) \|$/);
    if (!m || m[1] === 'Field' || /^-+$/.test(m[1])) continue;
    rows.push({ field: m[1].trim(), value: cellValue(m[2].trim()), cell: m[2].trim() });
  }
  return rows;
};

// An angle-bracket run holding whitespace is a template blank; the Plans
// row's <YYYY-MM-DD>-<slug> and the <id> paths are not.
const PLACEHOLDER = /<[^<>\n]*\s[^<>\n]*>/;

const gateProblems = (rows, pkgScripts) => {
  const problems = [];
  for (const { field, value, cell } of rows) {
    if (field.endsWith('_gate') && !/^n\/a\b/.test(value)) {
      const run = value.match(/^npm run (\S+)$/);
      const real = value === 'npm test' || (run && run[1] in pkgScripts);
      if (!real) {
        problems.push(`docs/context.md Identity row \`${field}\` names \`${value}\`, `
          + `which is not a script this project has. ${RESYNC}`);
      }
    }
    if (field === 'src_dir' && value !== 'src/') {
      problems.push(`docs/context.md Identity row \`src_dir\` is \`${value}\`, not \`src/\`. ${RESYNC}`);
    }
    const blank = cell.match(PLACEHOLDER);
    if (blank) {
      problems.push(`docs/context.md Identity row \`${field}\` still holds the template `
        + `placeholder ${blank[0]}. ${RESYNC}`);
    }
  }
  for (const needed of ['lint_gate', 'test_gate', 'build_gate']) {
    if (!rows.some((r) => r.field === needed)) {
      problems.push(`docs/context.md has no \`${needed}\` row. ${RESYNC}`);
    }
  }
  return problems;
};

const gate = (rows, field) => rows.find((r) => r.field === field)?.value;

test('the Identity table is present and has the three web gate rows', () => {
  const rows = identityRows(text());
  assert.ok(rows.length > 0, `docs/context.md has no Identity table. ${RESYNC}`);
  for (const field of ['lint_gate', 'test_gate', 'build_gate']) {
    assert.ok(gate(rows, field), `no \`${field}\` row. ${RESYNC}`);
  }
});

test('every gate row names a script this project has, or n/a', () => {
  const problems = gateProblems(identityRows(text()), scripts)
    .filter((p) => p.includes('which is not a script') || p.includes('has no `'));
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('src_dir is src/ and no row holds a template placeholder', () => {
  const problems = gateProblems(identityRows(text()), scripts)
    .filter((p) => p.includes('src_dir') || p.includes('placeholder'));
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the Architecture section holds no pack-template placeholder paragraph', () => {
  assert.doesNotMatch(text(), /<Replace this section/, RESYNC);
  assert.doesNotMatch(text(), /while the Identity table above holds the pack template/,
    'the stop-gap paragraph is back; the table itself is the source of the gates');
});

test('the check rejects the pack template', () => {
  const template = [
    '## Identity',
    '',
    '| Field | Value |',
    '|---|---|',
    '| `src_dir` | `src/, ios/` |',
    '| Framework | <one line: what this is built with and where it runs> |',
    '| `lint_gate` | `pnpm lint` |',
    '| `typecheck_gate` | `pnpm typecheck` |',
    '| `test_gate` | `pnpm test` |',
    '| `build_gate` | `pnpm build` |',
    "| `ios_build_gate` | `xcodebuild build -project ios/App.xcodeproj -scheme App -quiet` |",
    '| Plans | `plans/<YYYY-MM-DD>-<slug>.md` |',
    '| Reference docs | <the docs a planner should read after this one> |',
    '',
    '## Reviewers',
  ].join('\n');
  const problems = gateProblems(identityRows(template), scripts);
  assert.ok(problems.length >= 5, `expected at least five problems, got:\n${problems.join('\n')}`);
  for (const p of problems) assert.match(p, /resync/);
  assert.ok(problems.some((p) => p.includes('pnpm typecheck')));
  assert.ok(!problems.some((p) => p.includes('`Plans`')), 'the Plans row is not a blank');
});

test('the guard covers the exact gate commands the skills read', () => {
  const rows = identityRows(text());
  assert.equal(gate(rows, 'lint_gate'), 'npm run lint');
  assert.equal(gate(rows, 'test_gate'), 'npm test');
  assert.equal(gate(rows, 'build_gate'), 'npm run smoke');
});
