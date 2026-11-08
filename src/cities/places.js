// Where each city is. Plain data with no drawing code, so the weather
// function under api/ can import it in Node. Every folder under src/cities/
// is listed here and in index.js (lint checks both). Every entry carries a
// `country`; placeName is the one spelling of "City, Country".
export const PLACES = [
  { id: 'warsaw', title: 'Warsaw', country: 'Poland', lat: 52.23, lon: 21.01, zone: 'Europe/Warsaw' },
];

export const placeName = (p) => (p.country ? `${p.title}, ${p.country}` : p.title);
