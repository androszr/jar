- **The page talks to its own origin only.** A plan that has the browser call
  a vendor is wrong by construction: route it through a function under `api/`
  and say what it answers when the vendor fails.
- **Both shells in the same plan.** A UI step says what laptop and phone each
  do, branching in code, never by hiding a duplicate tree.
- **Same moment, same picture.** Name the phase or time a draw step is a
  function of; never plan a wall-clock read inside a draw function.
- **Security-relevant plans name the reviewer.** Anything touching `api/`,
  `vercel.json`, `index.html`, headers, the dev server or dependencies lists
  the security reviewer in its `Stages:` line and in a step.
- **Polling is gated on tab visibility.** Say how often, and that a hidden tab
  stops.
- **A new registry folder is registered.** Name the entry added to each
  registry beside the folder.
