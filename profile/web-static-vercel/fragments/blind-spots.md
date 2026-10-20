- **The deployed headers.** CSP, HSTS and the cache rules are config, and
  only observable on a live URL.
- **The real function runtime on Vercel.** The handler is run in Node by the
  dev server; whether Vercel honours `vercel.json` or the function's own
  `cache-control` is only visible deployed.
- **The real vendor's shape and availability.** Fixtures are frozen and the
  smoke check stubs the route; the vendor is not.
- **A header rule overriding the function.** The `/api/(.*)` rule in
  `vercel.json` may replace the function's own `cache-control` (even on a
  failure), and only a live response shows which one wins.
- **The CDN cache window.** Tests never see the edge cache; a stale answer
  after a deploy shows only on a live URL.
- **Real-phone feel.** Touch, glide and frame rate on a real device; the smoke
  check emulates touch in desktop Chromium.
