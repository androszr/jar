// The address follows the lifted jar: pure rules for the page's search string
// and the history entry states the page writes. Adapted in pattern from
// Memory Lane; nothing here touches the browser.

// `search` with `jar` set to `id`; every other parameter kept. Starts with `?`.
export function jarSearch(search, id) {
  const params = new URLSearchParams(search || '');
  params.set('jar', id);
  return `?${params.toString()}`;
}

// `search` without `jar`; '' when nothing else is left.
export function tableSearch(search) {
  const params = new URLSearchParams(search || '');
  params.delete('jar');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

export function entryFor(view, id, pushed) {
  if (view === 'jar') return { lane: 'jar', id, pushed: pushed === true };
  return { lane: 'table' };
}

// 'back' over an entry the page pushed, otherwise 'replace' in place (a page
// opened straight onto a jar).
export function leaveAction(state) {
  return state && state.lane === 'jar' && state.pushed === true ? 'back' : 'replace';
}
