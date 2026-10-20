- **Colours come from the palette files.** No hex, `rgb(`, `rgba(` or `hsl(`
  anywhere else.
- **The look lives in one module** and is named in one place.
- **The browser talks to its own origin only.** A vendor call goes under
  `api/`; `connect-src` stays `'self'`; no absolute-URL `fetch(` in `src/`.
- **Same moment, same picture.** No wall-clock read or randomness inside a
  draw function.
- **Both shells.** A UI change lands on laptop and phone in the same pass.
- **Vendor data is optional.** Draw and label with the empty answer.
- **Forward-compatible shapes.** A `v` key, unknown keys ignored, missing keys
  defaulted; nothing written to storage without a default on read.
- **Short cache windows.** No `immutable`, and no module `max-age` over 300.
