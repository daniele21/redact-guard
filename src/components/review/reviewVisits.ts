/**
 * Preserve human review progress for unchanged pages when analysis arrives
 * incrementally. A fresh/reanalysed page never inherits stale review evidence.
 * The currently visible analyzed page qualifies as opened after its new result
 * is rendered; a page not on screen must be explicitly visited.
 */
export function reconcilePageVisits(
  visited: ReadonlySet<number>,
  previousResults: Readonly<Record<number, unknown>>,
  results: Readonly<Record<number, unknown>>,
  errors: Readonly<Record<number, string>>,
  activePage: number,
): Set<number> {
  const next = new Set(visited);
  for (const page of visited) {
    if (!results[page] || errors[page] || (
      previousResults[page] !== undefined && previousResults[page] !== results[page]
    )) next.delete(page);
  }
  if (results[activePage] && !errors[activePage]) next.add(activePage);
  return next.size === visited.size && [...next].every(page => visited.has(page))
    ? visited as Set<number>
    : next;
}
