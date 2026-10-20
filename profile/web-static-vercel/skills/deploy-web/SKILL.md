---
name: deploy-web
description: Runbook for shipping {{PROJECT}}, a static page plus the Node
  functions under api/ — what CI checks, what a pull request preview does,
  what a push to main sets in motion, the first-deploy checklist, and how to
  confirm a deploy landed from the live headers. Use when the user says
  /deploy-web, "deploy", "ship it to production", "did the deploy work", or
  before touching vercel.json, the workflows or the pinned deploy tool.
---

# deploy-web

**Pushing to the default branch IS the deploy.** `.github/workflows/deploy.yml`
fires on every push to `main`. Nothing else is required, and nothing in this
skill runs a deploy by hand. The pipeline never commits or pushes; deploying
is the user's push.

## What is deployed

- `vercel.json` says `framework: null`, `buildCommand: null`,
  `installCommand: npm ci --omit=dev` and `outputDirectory: src`. Every file
  under `src/` is served as it is; there is no build step.
- Every `api/<name>.js` becomes a Node function on the version `engines.node`
  names. `"type": "module"` in `package.json` makes its `export default`
  handler valid.
- The headers come from `vercel.json`: a CSP with `connect-src 'self'`,
  `X-Robots-Tag: noindex, nofollow`, `nosniff`, `no-referrer`, HSTS,
  Permissions-Policy, short `Cache-Control` windows, and the `/api/(.*)` rule
  with `s-maxage=900`.
- There is no database, no migration, no env schema and no build. A function
  needs no secret of its own.

## What the workflows do

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | `workflow_call` only (deploy.yml calls it) | `npm ci` → `npx playwright-core install --with-deps chromium` → `npm run lint` → `npm test` → `SMOKE_TIMING=off npm run smoke`; the screenshots are kept when it fails |
| `deploy.yml` gates | every PR and every push to `main` | calls `ci.yml`; its check reads `Deploy / gates / Lint · Test · Smoke` |
| `deploy.yml` preview | same-repo PR, after the gates | installs the pinned CLI from `.github/vercel-cli/` with `npm ci --prefix` in a step that never sees the token, then `vercel pull --yes --environment=preview` → `vercel build` → `vercel deploy --prebuilt`; one PR comment, upserted by the marker `<!-- {{PROJECT}}-preview -->` |
| `deploy.yml` production | push to `main`, after the gates | `vercel pull --yes --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`, under the `production` environment; a push to `main` is never cancelled |

A fork's pull request has no access to the secrets, so it gets the gates and
no preview.

## Rules

- **Never run `vercel --prod` by hand.** The workflow is the only deploy path;
  a hand deploy leaves no run to audit.
- **Verify with `gh run list --limit 4`** and expect `Deploy` green. Allow a
  couple of minutes. **`vercel ls` immediately after a push is stale** and
  shows the previous deployment — do not conclude from it that nothing
  deployed.
- **There is no Vercel-native Git integration** (`vercel.json` turns it off),
  so the dashboard lists deployments by username rather than commit. That is
  expected.
- **Secrets live in exactly one place:** GitHub repository secrets. Do not ask
  the user to re-add them anywhere else.
- **A production dependency's install script runs inside `vercel build`**
  with the deploy token in reach. Keep `dependencies` empty, or review every
  package and its install scripts (`/security-pass` lists them).
- **The deploy tool is pinned** by `.github/vercel-cli/package-lock.json`, and
  bumping it is a dependency change the security reviewer sees.
- **Raw `<project>-<hash>-…` URLs may 302 to Vercel SSO.** That is deployment
  protection, not failure; confirm on the production address instead.

## First deploy

Work down this list in order; each item is something a person can check.

1. The folder is a git repository with a GitHub remote and a `main` branch.
2. The Vercel project exists: framework Other, no build command, output
   directory `src`, and **not** connected to GitHub. Note its org id and
   project id.
3. The three secrets are set (table below).
4. `.github/vercel-cli/package.json` and its `package-lock.json` are
   committed.
5. `npm run lint && npm test && SMOKE_TIMING=off npm run smoke` pass locally.
6. Push to `main`.
7. Run `gh run list --limit 4` until `Deploy` is green.
8. Follow "How to confirm it landed" below.
9. Write the production address into `docs/context.md`.

## When asked to deploy

1. Confirm the working tree is committed on `main` — if not, say so and stop;
   committing is the user's act.
2. Say what the push will set in motion, in one sentence.
3. After the user pushes, run `gh run list --limit 4` until `Deploy` is green
   or red. On red, `gh run view <id> --log-failed` and report the failing step
   in plain words.
4. Confirm it landed (next section) and report what you saw.

## How to confirm it landed

Use the production address (from `docs/context.md`) as `$URL`.

```bash
curl -sSI "$URL/"
```

Expect `content-security-policy` containing `connect-src 'self'` and
`frame-ancestors 'none'`,
`x-robots-tag: noindex, nofollow`, `x-content-type-options: nosniff` and a
`strict-transport-security` header.

```bash
curl -sS -D - "$URL/api/<function>"
```

For a project with a weather helper that is `/api/weather`. Expect
`content-type: application/json`, `cache-control: public, max-age=0,
s-maxage=900` and a body containing `"v":1`. A page with no function skips this
line and says so. A 502 with `"v":1` and `"ok":false` means the deploy
landed but the vendor behind the function is down — report that, not a failed
deploy. Ignore which `cache-control` it shows: the function sends `no-store`
on a failure, but the `/api/(.*)` rule in `vercel.json` may override it at the
edge.

```bash
curl -sS "$URL/robots.txt"
```

Expect `Disallow: /`.

## Secrets the workflows expect

| Where | Name | Used by |
|---|---|---|
| GitHub repository secret | `VERCEL_TOKEN` | preview and production deploy |
| GitHub repository secret | `VERCEL_ORG_ID` | preview and production deploy |
| GitHub repository secret | `VERCEL_PROJECT_ID` | preview and production deploy |

Prefer several small conventional commits with real reasoning in the message
over one blob — the history is bisectable and the *why* is what a future
reader needs.
