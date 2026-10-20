// The registry of cities: one folder per city under src/cities/, one import
// and one entry here, and one entry in places.js. Lint fails an unlisted folder.
//
// A city entry provides:
//   id        kebab-case; the same as its places.js entry and its folder name
//   title     the name on the label
//   location  { lat, lon, zone } (from places.js); drives the city's clock
//   lid       'cork' | 'tin'
//   label     { inks: { plate, ink } } - names of colours in the look's PALETTE
//   buildPlates(w, h)   precomputed, size-dependent drawing data
//   paint(ctx, rect, phase, tint, weather, plates, nowMs)
//             draws the diorama into rect (the jar's interior, local px)
//   seed      optional number for the city's own randomness
//
// One jar is one city: a second view of a city (another square, another statue)
// is a change to that city's scene, never a second jar.
import warsaw from './warsaw/index.js';

export const CITIES = [warsaw];

export const findCity = (id) => CITIES.find((c) => c.id === id) || null;
