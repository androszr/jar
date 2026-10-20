1. **Colour literals only in palettes.** The palette files the lint lists are
   the only files allowed `#hex`, `rgb(`, `rgba(` or `hsl(`. *(lint, verifier
   grep)*
2. **The look is one module.** It is named in one place, and nothing outside
   it defines a gradient colour, a font or a glow. *(lint, look test)*
3. **The browser talks only to its own origin.** Every vendor call lives under
   `api/`, `connect-src` stays `'self'`, and there is no `fetch(` of an
   absolute URL in `src/`. *(lint, hosting test, security reviewer)*
4. **Same moment, same picture.** A draw function never reads the wall clock
   or `Math.random`; it is a function of the phase or the time passed in.
   *(smoke determinism check)*
5. **Both shells, same pass.** Laptop and phone change together, branching on
   aspect in code, never CSS-hiding a duplicate tree. *(preflight BLOCK)*
6. **Vendor data is optional.** Every surface draws and every label reads with
   the empty answer. *(smoke degrade check)*
7. **Every registry folder is listed.** A new folder is the folder plus its
   entry in each registry. *(lint)*
8. **Transported shapes are forward-compatible.** A body carries a `v` key,
   unknown keys are ignored, missing keys default; nothing is written to
   storage without a default on read. *(api tests)*
9. **Never commit or push** unless explicitly asked.
