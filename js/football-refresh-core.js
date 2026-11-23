/** A local-only refresh schedule. No claim of guaranteed live scores. */
export const FOOTBALL_REFRESH = Object.freeze({
  activeAuto: 4 * 60_000,
  activeManual: 90_000,
  nearAuto: 12 * 60_000,
  nearManual: 3 * 60_000,
  quietAuto: 2 * 60 * 60_000,
  quietManual: 10 * 60_000,
});

/**
 * Active: unfinished matches from kickoff to four hours after.
 * Near: imminent kickoffs, recently finished results, or unconfirmed late games.
 * Quiet: otherwise; polling stays very infrequent.
 */
export function matchRefreshPhase(matches, now = Date.now()) {
  if (!Array.isArray(matches)) return 'quiet';
  let near = false;
  for (const match of matches) {
    if (!match || typeof match.time !== 'string') continue;
    const kickoff = Date.parse(match.time);
    if (!Number.isFinite(kickoff)) continue;
    const delta = now - kickoff;
    if (match.finished !== true && delta >= 0 && delta <= 4 * 60 * 60_000) return 'active';
    if (delta >= -2 * 60 * 60_000 && delta <= (match.finished === true ? 3 : 7) * 60 * 60_000) near = true;
  }
  return near ? 'near' : 'quiet';
}
export function footballRefreshDelay(matches, manual = false, now = Date.now()) {
  const phase = matchRefreshPhase(matches, now);
  return FOOTBALL_REFRESH[`${phase}${manual ? 'Manual' : 'Auto'}`];
}
