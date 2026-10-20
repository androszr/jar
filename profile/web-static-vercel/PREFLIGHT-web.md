# Ship preflight — static page plus functions on Vercel

Domain checks run by `preflight.sh` after the structural checklist. `$PLAN` is
the plan path; every finding is one `BLOCK:` or `WARN:` line.

## S1. Framework jargon in the plain-language zone — WARN

```bash
awk '/^## What this does/{f=1} /^## Technical detail/{f=0} f' "$PLAN" \
  | grep -nE 'src/|\.m?js([^a-zA-Z]|$)|npm|Node|Playwright|Vercel|Canvas|CSP|vercel\.json' \
  && echo "WARN: plain-language zone names a tool or path (lines above) — relocate below ## Technical detail"
true
```

## S2. Raw hex colours in the plan — WARN

```bash
grep -nE '#[0-9a-fA-F]{3,8}\b' "$PLAN" && echo "WARN: use the palette files, not hex"
true
```

## S3. Security-relevant plan without a reviewer step — BLOCK

Word-bounded on purpose: a bare `auth` matched *author* and a bare `header`
matched *page header*, and a false BLOCK here is a stall the user cannot
diagnose. Never loosen this back into a substring match.

```bash
if grep -qiE '\bauth\b|authenticat|authoriz|allowlist|sign-in|login|middleware|package\.json|vercel-cli|\.github/workflows|VERCEL_TOKEN|secrets\.|\.env\b|\b(ci|deploy)\.ya?ml\b|npm (i|install)\b|api_key|\bapi/|vercel\.json|index\.html|tools/serve|package-lock|localStorage|XMLHttpRequest|WebSocket|postMessage|fetch\(|process\.env|dependenc|cookie|security header|response header|http header|headers\(|\bcsp\b|content-security' "$PLAN"; then
  grep -q 'security-reviewer' "$PLAN" \
    || echo "BLOCK: security-relevant plan must name the security reviewer in its Stages line and in a step"
fi
true
```

*Fix:* add `{{P}}-security-reviewer` to the `Stages:`
line and to the step that touches the function, headers or dependencies.

## S4. Vendor call from the page — BLOCK

Proxy clauses are exempt, nothing else is: the page asking its own function
("fetches /api/weather"), "/api/x, which in turn fetches https://…", an `api/…`
file fetching its vendor (server-side by construction, on any line), a generic
"function" or "handler" doing so (only on a line that names no `src/`, browser,
page, client, front end, click or listener), and negations ("never calls"). A line that
merely mentions `api/` is still checked, so a long plan line cannot hide a
direct vendor call behind it.

```bash
hits=$(perl -pe '
  s/\b(never|not|no|without|cannot)\s+(\w+\s+)?(calls?|fetch(es)?)\b//ig;
  s{/api/[\w./-]*,?\s+which\s+(\w+\s+){0,3}(fetch(es)?|calls?|proxies|asks)\s+\S+}{}ig;
  s{\b(fetch(es)?|calls?|reads?|asks?|requests?)\s+`?/api/[\w./-]*`?}{}ig;
  s{(?<![\w/])api/[\w./-]*\w(?=\s)\s+(\w+\s+){0,2}(fetch(es)?|calls?|requests?)\s+https?://\S+}{}ig;
  s{\b(function|handler|server|proxy|endpoint|route)(?=\s)\s+(\w+\s+){0,2}(fetch(es)?|calls?|requests?)\s+https?://\S+}{}ig unless /src\/|\b(browser|page|client|front-?end|click|onclick|listener|ui)\b/i;
' "$PLAN" | grep -iE 'src/[^ ]*\.m?js[^.]{0,60}(fetch|calls)[^.]{0,60}(https?://|api\.[a-z0-9-]+\.[a-z]+)|\b(browser|page|client)\b[^.]{0,40}\b(calls?|fetch(es)?|requests?|loads?)\b[^.]{0,60}(vendor|open-meteo|https?://|api\.[a-z0-9-]+\.[a-z]+)|\b(fetch(es)?|calls?|requests?|loads?|opens?|connects?)\s+(https?|wss?)://')
[ -n "$hits" ] \
  && echo "BLOCK: the page talks to its own origin only — route the vendor call through a function under api/"
true
```

## S5. UI plan missing both shells — BLOCK

```bash
if grep -qiE 'screen|component|button|row|nav|layout|page' "$PLAN"; then
  grep -qiE 'desktop|mobile|breakpoint' "$PLAN" \
    || echo "BLOCK: UI plans must state BOTH mobile and desktop behaviour"
fi
true
```

## S6. Polling without gating — WARN

```bash
if grep -qiE 'poll|refetchInterval|interval' "$PLAN"; then
  grep -qiE 'visibilit|hidden|background|hours' "$PLAN" \
    || echo "WARN: polling must be gated on tab visibility (and business hours where they apply)"
fi
true
```

## S7. A new registry folder not registered — WARN

Only whole-word add/new/create wording near a folder path counts; editing a file inside an
existing folder does not.

```bash
if grep -qiE '(^|[^a-z])(add(s|ed|ing)?|new|create[sd]?)([^a-z]|$)[^.]{0,60}src/(cities|memories)/[A-Za-z0-9_-]+(/|[^A-Za-z0-9_./-]|$)' "$PLAN"; then
  grep -qE 'src/(cities|memories)/index\.js' "$PLAN" \
    || echo "WARN: a new registry folder must be listed — name the registry's index.js entry"
fi
true
```

## S8. Cache window — WARN

Only a `max-age` directly after `Strict-Transport-Security` or `HSTS` is
exempt; every other `max-age` over 300 is flagged. "no immutable" is a negation and
is not flagged.

```bash
perl -pe 's/(strict-transport-security|hsts)[\s:=,]*(?:(?:at|to|is|of)[\s:=,]+)?max-age=\d+//ig' "$PLAN" \
  | perl -pe 's/\bno\s+`?immutable`?//ig' \
  | grep -niE 'immutable|stale-while-revalidate|max-age=(30[1-9]|3[1-9][0-9]|[4-9][0-9]{2}|[0-9]{4,})' \
  && echo "WARN: modules keep short cache windows (max-age at most 300, no immutable; HSTS is exempt)"
true
```
