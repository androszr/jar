1. **Wall-clock reads in draw code** — `Date.now()` or `new Date()` inside a
   draw function, so the same moment draws two pictures.
2. **Timezone round-trips** — a zone offset passed through a `Date` and
   shifting an hour or a day; local time used where the place's zone is meant.
3. **Off-origin requests** — an absolute-URL `fetch(`, an image or script from
   another host, a CSP that was widened to make one work.
4. **Hidden-tab refetch** — a timer that keeps calling the function while the
   tab is hidden.
5. **The function's failure path** — on a vendor error, does it answer the
   empty shape with a failure status, or a stack trace?
6. **Touch targets and safe-area insets** — a tap target under 44px; content
   hidden behind the home indicator or a notch.
7. **Pixel ratio and resize** — a canvas that blurs on a dense screen or keeps
   its old size after a rotation.
8. **Header parity** — the dev server and `vercel.json` sending different
   headers, so a local pass hides a deployed failure.
