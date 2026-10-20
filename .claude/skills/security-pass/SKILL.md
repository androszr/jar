---
name: security-pass
description: Standalone security audit of the working tree (or the whole page
  before a milestone ships) for jar, a static page plus Node functions
  under api/. Runs deterministic checks — dependency audit, secret scan,
  off-origin calls, injection surfaces, headers and the function's answer
  against a live URL — then spawns jar-security-reviewer for the judgment
  calls. Use when the user says /security-pass, "audit security", "check the
  headers", or before shipping a milestone.
---

# security-pass

Two halves: cheap deterministic checks first, then the reviewer agent for what
greps cannot decide. Run the greps before spawning — a `BLOCK` from `npm audit`
does not need an LLM to confirm it.

## Args

`/security-pass [url]` — optional deployed URL for the header and function
checks. Without it, those sections are skipped and reported as skipped (not as
passing).

## Agent spawn visual convention

Before spawning `jar-security-reviewer` in Phase 2, read
`.claude/skills/security-pass/banners/security.txt` and paste its full content
as a fenced code block in your text response — **not** via `cat`, because shell
output collapses in the terminal scroll. Re-dispatches re-show the banner. If
the assistant cannot spawn a sub-agent, run the role yourself from
`.claude/agents/jar-security-reviewer.md`.

| Agent | Character | Phase | Banner file |
|---|---|---|---|
| `jar-security-reviewer` | Watch | 2 | `security.txt` |

## Phase 1: deterministic checks

Run all of these; collect results before spawning anything. No banner here —
Phase 1 spawns nothing.

```bash
# 1. Dependency vulnerabilities — high/critical is a BLOCK.
npm audit --omit=dev
# ... and the deploy tool's own tree, which runs with the deploy token.
npm audit --prefix .github/vercel-cli

# 1b. Install scripts. A production dependency's install script runs inside
#     `vercel build` with the deploy token in reach, and the deploy tool's own
#     tree installs in a CI step before the token step. Each package printed
#     has an install script: dev-only entries (esbuild, fsevents under the
#     deploy tool or playwright) may appear; what matters is any package the
#     root's `dependencies` pull in, and anything new in the deploy tool's tree.
node -e 'for (const f of process.argv.slice(1)) { const l = JSON.parse(require("fs").readFileSync(f, "utf8")); for (const [k, v] of Object.entries(l.packages || {})) if (v.hasInstallScript) console.log(f + ": " + k); }' package-lock.json .github/vercel-cli/package-lock.json

# 2. Secrets committed to the tree (the whole tree, case-insensitive). Values
#    starting with $ are references, not secrets.
grep -rniE '(SECRET|TOKEN|API_KEY|PASSWORD)\s*=\s*["'"'"'][^"'"'"'$][^"'"'"']*|["'"'"']?(secret|token|api_key|password)["'"'"']?\s*:\s*["'"'"'][^"'"'"'$]+' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=test-output
# ... and any dotfile under src/ (everything there is published as it is).
find src -name '.*'

# 3. Off-origin requests from the page.
grep -rnE "fetch[A-Za-z]*\(\s*.(https?:)?//" src/
grep -rnE "(new (WebSocket|EventSource)|sendBeacon|import)\(\s*.(https?:|wss?:)?//|\.src\s*=\s*.(https?:)?//|src=.(https?:)?//" src/
grep -rnE "['\"\`](https?|wss?)://" src/ | grep -v 'www.w3.org'

# 4. Injection surfaces in the page.
grep -rnE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function\(' src/

# 5. Request input read by a function. Anything printed must be validated in
#    the handler; say where.
grep -rnE 'req\.(query|body|url|headers)' api/

# 6. The dev server sends the same headers as vercel.json.
node --test test/hosting.test.js
```

### Header and function check (only when a URL was given)

```bash
curl -sSI "$URL/" | grep -iE 'strict-transport-security|content-security-policy|x-content-type-options|x-robots-tag|referrer-policy|permissions-policy'
```

Every one of those six must be present. Also confirm the CSP contains
`connect-src 'self'` and `frame-ancestors 'none'` (clickjacking), no
`'unsafe-eval'` and no wildcard origin.

```bash
curl -sS -D - "$URL/api/<name>"
```

The function answers JSON, never a stack trace, and answers a 502 with the
empty shape when the vendor fails.

## Phase 2: spawn the reviewer

Show the **Watch** banner (`banners/security.txt`), then spawn
`jar-security-reviewer` with:

```
Review the working tree against your brief.
context_path: <abs path to docs/context.md>
Deterministic results already collected:
<paste Phase 1 output>

Do not re-run those. Focus on what they cannot decide: whether any new code
widens the threat surface described in your brief, how a function handles its
input and its vendor failure, how the function bounds the vendor's answer,
and what the headers allow.
```

## Phase 3: report

Merge both halves into one table, most severe first, then:

```
VERDICT: BLOCK | WARN | CLEAN
SKIPPED: <any check not run, and why>
```

Be explicit about what was skipped. A report that silently omits the header
check reads as "headers are fine" when nobody looked. No `bob-tldr`, no
`bob-actions`: an audit is not waiting on anybody.
