// What to announce to a screen reader when the lifted jar's spoken forecast
// changes. `prev` and `next` are null on the table, else { id, text } where
// `text` is the forecast + sun sentence of the lifted jar ('' when there is
// nothing to say). Pure: no clock, no DOM.
export const UPDATED = 'Weather updated.';
export function forecastAnnouncement(prev, next) {
  if (!next || !prev) return null; // on the table, or the lift itself
  if (prev.id !== next.id) return null; // a different jar came up
  if (!next.text || next.text === prev.text) return null; // blank now, or nothing new
  return `${UPDATED} ${next.text}`;
}
