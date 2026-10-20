#!/bin/bash
# Render the profile with Dark Army's own renderer into test-output/profile-render/
# and assert that what it writes describes a static page plus one function.
# Run from the project root:  bash profile/render-check.sh
set -eu

HOST="$(cd "${DARK_ARMY_HOST:-../dark-army/host}" && pwd)"
PY="$HOST/.venv/bin/python"
OUT=test-output/profile-render
ROOT="$(pwd)"
PROFILES="$ROOT/profile"
rm -rf "$OUT"
mkdir -p "$OUT"

(cd "$HOST" && PROFILES="$PROFILES" OUT="$ROOT/$OUT" "$PY" - <<'PYEOF'
import os, sys
from pathlib import Path
sys.path.insert(0, '.')
from dark_army_menubar import pack_render

user_dir = Path(os.environ['PROFILES'])
out = Path(os.environ['OUT'])
rows = pack_render.available_profiles(user_dir=user_dir)
want = {'id': 'web-static-vercel', 'origin': 'yours', 'label': 'Static page + one function'}
assert any(all(r.get(k) == v for k, v in want.items()) for r in rows), rows
files = pack_render.render('web-static-vercel', 'jar', 'jar', user_dir=user_dir)
for key, data in files.items():
    target = out / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data if isinstance(data, bytes) else data.encode())
PYEOF
)

fail() { echo "profile: FAIL - $*" >&2; exit 1; }

# The old tools appear in none of the files the profile owns or splices into.
for f in .claude/skills/deploy-web/SKILL.md .claude/skills/ship/PREFLIGHT-web.md \
         .claude/skills/security-pass/SKILL.md .github/workflows/ci.yml \
         .github/workflows/deploy.yml .claude/agents/jar-planner.md \
         .claude/agents/jar-verifier.md .claude/agents/jar-bug-auditor.md \
         .claude/agents/jar-security-reviewer.md .claude/review.md \
         .claude/skills/ship/templates/questions.md .claude/settings.json; do
  [ -f "$OUT/$f" ] || fail "$f was not rendered"
  n=$(grep -cE 'pnpm|Neon|db:migrate|Next\.js|typecheck|drizzle|server-only' "$OUT/$f" || true)
  [ "$n" = 0 ] || fail "$f still names an old tool ($n lines)"
done

RUN="$OUT/.claude/skills/deploy-web/SKILL.md"
for needle in 'npm run smoke' 'api/weather' 'vercel-cli' "connect-src 'self'" 's-maxage=900' \
              'VERCEL_PROJECT_ID' 'noindex' '## First deploy' '## How to confirm it landed'; do
  grep -qF -- "$needle" "$RUN" || fail "the runbook does not name: $needle"
done

[ "$(grep -cF '<!-- jar-preview -->' "$OUT/.github/workflows/deploy.yml")" = 1 ] \
  || fail "deploy.yml needs the preview marker exactly once"
for needle in 'npm run lint' 'npm test' 'npm run smoke' 'jar-security-reviewer'; do
  grep -qF -- "$needle" "$OUT/docs/context.md" || fail "docs/context.md does not name: $needle"
done

# The preflight, run against the rendered checklist folder.
SHIP="$OUT/.claude/skills/ship"
set +e
blocked=$(bash .claude/skills/ship/preflight.sh profile/fixtures/plan-blocked.md "$SHIP")
code=$?
set -e
[ "$code" = 1 ] || fail "plan-blocked.md should exit 1, got $code"
printf '%s\n' "$blocked" | grep -q '^BLOCK:.*security reviewer' || fail "plan-blocked.md did not BLOCK on the security reviewer"

set +e
clean=$(bash .claude/skills/ship/preflight.sh profile/fixtures/plan-clean.md "$SHIP")
code=$?
set -e
[ "$code" = 0 ] || fail "plan-clean.md should exit 0, got $code: $clean"
[ "$(printf '%s\n' "$clean" | tail -n 1)" = "PREFLIGHT: clean" ] || fail "plan-clean.md did not end clean"

# Each regex, proven on a one-line case appended to the clean plan (or, for S3,
# to the blocked plan with its trigger word removed).
CASES="$OUT/cases"
mkdir -p "$CASES"
run_case() { # name, base plan, line  -> sets CASE_OUT / CASE_RC
  { cat "$2"; printf '\n%s\n' "$3"; } > "$CASES/case-$1.md"
  set +e
  CASE_OUT=$(bash .claude/skills/ship/preflight.sh "$CASES/case-$1.md" "$SHIP")
  CASE_RC=$?
  set -e
}
must_block() { run_case "$1" "$2" "$3"; [ "$CASE_RC" = 1 ] && printf '%s\n' "$CASE_OUT" | grep -q "^BLOCK:.*$4" || fail "case $1 must BLOCK ($4): $CASE_OUT"; }
must_pass() { run_case "$1" "$2" "$3"; [ "$CASE_RC" = 0 ] && ! printf '%s\n' "$CASE_OUT" | grep -q '^WARN:' || fail "case $1 must pass with no WARN: $CASE_OUT"; }
must_warn() { run_case "$1" "$2" "$3"; printf '%s\n' "$CASE_OUT" | grep -q "^WARN:.*$4" || fail "case $1 must WARN ($4): $CASE_OUT"; }

CLEAN=profile/fixtures/plan-clean.md
# plan-clean must carry the proxy-design and edit-in-place sentences and produce no WARN at all.
must_pass clean-as-is "$CLEAN" "Nothing else changes."
must_pass s4-negated "$CLEAN" "The browser never calls the vendor."
must_pass s4-proxy-which "$CLEAN" "src/weatherfeed.js asks /api/weather, which proxies https://api.open-meteo.com/v1/forecast for it."
must_pass s4-function-side "$CLEAN" "The handler fetches https://api.open-meteo.com/v1/forecast and tidies it."
must_block s4-long-line "$CLEAN" "Unlike today's api/weather proxy, src/main.js now fetches https://api.open-meteo.com/v1/forecast itself." "own origin"
must_block s4-instead "$CLEAN" "The page fetches https://api.open-meteo.com directly instead of going through api/weather." "own origin"
must_block s4-src-instead "$CLEAN" "src/weather.js fetches https://api.open-meteo.com directly instead of going through api/weather" "own origin"
must_block s4-no-longer "$CLEAN" "no longer calls api/weather; it fetches https://api.open-meteo.com" "own origin"
must_pass s4-both-sides "$CLEAN" "The page fetches /api/weather, and api/weather.js fetches https://api.open-meteo.com."
must_pass s4-never-calls "$CLEAN" "The page never calls the vendor; api/weather.js fetches https://api.open-meteo.com."
must_block s4-click-handler "$CLEAN" "The click handler fetches https://api.open-meteo.com." "own origin"
must_block s4-client-handler "$CLEAN" "The client's handler fetches https://api.open-meteo.com." "own origin"
must_block s4-opens-wss "$CLEAN" "the page opens wss://stream.example.com." "own origin"
must_block s4-click "$CLEAN" "In src/sky.js the click handler fetches https://api.open-meteo.com" "own origin"
must_block s4-helper "$CLEAN" "src/sky.js gets a helper function that fetches https://api.open-meteo.com" "own origin"
must_block s4-new-handler "$CLEAN" "src/sky.js adds a new handler that calls https://api.open-meteo.com" "own origin"
must_block s4-no-longer-and "$CLEAN" "The browser no longer fetches /api/weather and fetches https://api.open-meteo.com instead" "own origin"
must_block s4-requests "$CLEAN" "the page requests https://api.open-meteo.com" "own origin"
must_block s4-loads "$CLEAN" "the browser loads data from api.open-meteo.com" "own origin"
must_block s4-host-calls "$CLEAN" "The browser calls api.open-meteo.com for the forecast." "own origin"
must_block s4-host-fetches "$CLEAN" "The page fetches the forecast from api.open-meteo.com on load." "own origin"
must_pass s7-padding "$CLEAN" "Tidy the padding in src/cities/warsaw/style.js."
must_pass s7-address "$CLEAN" "Rename the address label in src/cities/warsaw/label.js."
must_warn s8-hsts-stays "$CLEAN" "HSTS stays, modules max-age=3600." "cache windows"
must_pass s8-hsts-linked "$CLEAN" "Keep HSTS at max-age=63072000 and Strict-Transport-Security: max-age=63072000."
must_block s4-browser "$CLEAN" "The browser fetches open-meteo directly from the page." "own origin"
must_block s4-page-calls "$CLEAN" "The page calls https://example.com/x from src/weather.js" "own origin"
must_block s4-mjs "$CLEAN" "src/main.mjs fetches https://example.com/x" "own origin"
must_warn s7-new "$CLEAN" "Add a new folder src/cities/Paris_2/ for the city." "registry folder"
must_pass s7-registered "$CLEAN" "Add src/cities/paris/ and an entry in src/cities/index.js."
must_warn s8-hsts-mixed "$CLEAN" "Keep HSTS as is; set modules to max-age=3600." "cache windows"
must_warn s8-immutable "$CLEAN" "Serve modules as immutable." "cache windows"

# S3: the blocked plan with its api/ trigger removed is quiet; each added trigger BLOCKs.
sed 's#api/weather\.js#src/x.js#g' profile/fixtures/plan-blocked.md > "$CASES/s3-base.md"
run_case s3-base "$CASES/s3-base.md" "Nothing else."
[ "$CASE_RC" = 0 ] || fail "s3 base plan should be quiet: $CASE_OUT"
for trig in 'Edit package.json scripts.' 'Bump the vercel-cli pin.' 'Edit .github/workflows/deploy.yml.' 'Rotate VERCEL_TOKEN.' 'Read secrets.X in a step.' 'Add a .env file.' 'Touch the middleware.' 'Store a value in localStorage.' 'Use a WebSocket.' 'Call postMessage.' 'Edit package-lock.json.' 'Touch ci.yml.' 'Edit deploy.yaml.' 'Run npm install.' 'Read the api_key.'; do
  must_block "s3-$(printf '%s' "$trig" | tr -c 'A-Za-z0-9' '-')" "$CASES/s3-base.md" "$trig" "security reviewer"
done

# The request-sink and cache greps shipped in the rendered security-pass skill and conventions.
SP="$OUT/.claude/skills/security-pass/SKILL.md"
T="$CASES/tree"; rm -rf "$T"; mkdir -p "$T/src" "$T/api"
cat > "$T/src/bad.js" <<'JSEOF'
const a = this.fetchImpl('https://x.example/a');
const b = fetch(`https://x.example/b`);
const c = new WebSocket("wss://x.example");
img.src = 'https://x.example/i.png';
const U = 'https://x.example/u';
const W = 'wss://x.example/w';
fetch(U);
el.insertAdjacentHTML('beforeend', x);
JSEOF
cat > "$T/src/ok.js" <<'JSEOF'
const ns = 'http://www.w3.org/2000/svg';
fetch('/api/weather');
JSEOF
extract() { awk -v tag="$1" 'index($0, tag) {f=1; next} f && /^$/ {exit} f' "$SP"; }
off=$(extract '# 3. Off-origin' | sed "s# src/# $T/src/#")
hits=$(eval "$off" 2>/dev/null || true)
for must in 'fetchImpl' 'fetch(`https' 'WebSocket' 'img.src' 'const U' 'const W'; do printf '%s\n' "$hits" | grep -qF -- "$must" || fail "off-origin grep missed: $must"; done
printf '%s\n' "$hits" | grep -qE 'ok\.js' && fail "off-origin grep flagged ok.js (svg namespace, href or /api fetch)"
inj=$(extract '# 4. Injection' | sed "s# src/# $T/src/#")
eval "$inj" 2>/dev/null | grep -q insertAdjacentHTML || fail "injection grep missed insertAdjacentHTML"
# The verifier brief carries each off-origin grep exactly as the skill does (table pipes unescaped).
conv=$(sed 's/\\|/|/g' "$OUT/.claude/agents/jar-verifier.md")
for line in $(printf '%s\n' "$off" | wc -l | tr -d ' ' | xargs seq 1); do
  one=$(extract '# 3. Off-origin' | sed -n "${line}p")
  printf '%s\n' "$conv" | grep -qF -- "$one" || fail "verifier brief lacks the skill's off-origin grep: $one"
done
# secret scan, as written in the skill, against a temp tree.
sec=$(extract '# 2. Secrets' | grep -v '^#' | sed "s# \. --exclude# $T --exclude#")
mkdir -p "$T/conf"
printf '%s\n' 'const TOKEN = "abc123";' > "$T/src/s1.js"
printf '%s\n' 'api_key: '"'"'zzz'"'"'' 'password: "hunter2"' > "$T/conf/c.yml"
printf '%s\n' 'run: deploy --token="$VERCEL_TOKEN"' 'token: "$X"' > "$T/conf/ok.yml"
sh_hits=$(eval "$sec" 2>/dev/null || true)
for must in 's1.js' 'c.yml'; do printf '%s\n' "$sh_hits" | grep -qF -- "$must" || fail "secret scan missed $must"; done
printf '%s\n' "$sh_hits" | grep -qF 'ok.yml' && fail "secret scan flagged a \$ reference"
# install-script check lists the packages with an install script in a lockfile.
mkdir -p "$T/lock"
printf '%s\n' '{"packages":{"":{},"node_modules/a":{"hasInstallScript":true},"node_modules/b":{"version":"1"}}}' > "$T/lock/package-lock.json"
inst=$(extract '# 1b.' | grep -v '^#' | sed "s# package-lock.json .github/vercel-cli/package-lock.json# $T/lock/package-lock.json#")
out=$(eval "$inst") || fail "install-script check did not run"
printf '%s\n' "$out" | grep -q 'node_modules/a' || fail "install-script check did not list the package"
printf '%s\n' "$out" | grep -q 'node_modules/b' && fail "install-script check listed a package without an install script"
# cache grep, as written in the fragment, against three slipping forms and the honest file.
mkdir -p "$CASES/cache"
cache_cmd() { grep -A1 '"Cache-Control"' "$1" | grep -E '(^|[ ,"])max-age=(30[1-9]|3[1-9][0-9]|[4-9][0-9]{2}|[0-9]{4,})' || true; }
printf '%s\n' '"Cache-Control"' '"value": "max-age=86400"' '"Cache-Control"' '"value": "public,max-age=86400"' '"Cache-Control"' '"value": "public, s-maxage=900, max-age=3600"' > "$CASES/cache/bad.json"
[ "$(cache_cmd "$CASES/cache/bad.json" | wc -l | tr -d ' ')" = 3 ] || fail "cache grep missed a long max-age form"
printf '%s\n' '"Strict-Transport-Security"' '"value": "max-age=63072000"' '"Cache-Control"' '"value": "public, max-age=60"' '"Cache-Control"' '"value": "public, max-age=0, s-maxage=900"' > "$CASES/cache/ok.json"
[ -z "$(cache_cmd "$CASES/cache/ok.json")" ] || fail "cache grep flagged HSTS or a short window"
grep -qF -- "(^\\|[ ,\"])max-age=(30[1-9]" "$OUT/.claude/agents/jar-verifier.md" || fail "verifier brief lacks the cache pattern"

echo "profile: ok"
