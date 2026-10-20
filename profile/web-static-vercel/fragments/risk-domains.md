- **The browser talks only to its own origin.** A vendor call from the page is
  both a key-exposure and a policy hole. **Lead with this one**: a widened
  `connect-src` is invisible until it is abused. Plain-language framing: "the
  page would start talking to a stranger's server."
- **Headers and CSP.** A weaker CSP, a missing `nosniff`, HSTS or
  `X-Robots-Tag`, or a cache window that serves a stale module after a deploy.
- **The function's input and failure path.** Request input printed unvalidated,
  a stack trace in an answer, a vendor error that is not the empty shape.
- **Dependencies and the pinned deploy tool.** A new package, or a bump of the
  pinned Vercel CLI, reaches the deploy token's environment.
- **Secrets.** A token or key in the tree; the deploy secrets live in GitHub
  repository secrets and nowhere else.
- **Same moment, same picture.** A wall-clock read or randomness in drawing.
- **Both shells, one pass.** A UI change handling only laptop or only phone.
- **Colours from the palette.** The palette files are the only place for a
  literal.
