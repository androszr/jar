// Where each city is. Plain data with no drawing code, so the weather
// function under api/ can import it in Node. Every folder under src/cities/
// is listed here and in index.js (lint checks both). Every entry carries a
// `country`; placeName is the one spelling of "City, Country". `sea` is
// optional: the offshore point the weather function reads the wave height at.
export const PLACES = [
  { id: 'warsaw', title: 'Warsaw', country: 'Poland', lat: 52.23, lon: 21.01, zone: 'Europe/Warsaw' },
  { id: 'nazare', title: 'Nazaré', country: 'Portugal', lat: 39.6, lon: -9.07, zone: 'Europe/Lisbon', sea: { lat: 39.62, lon: -9.12 } },
];

export const placeName = (p) => (p.country ? `${p.title}, ${p.country}` : p.title);
