/** MyHub v6.5.0 — small, side-effect-free guards for everyday UI actions. */
export function ownsRequest(active, candidate) {
  return candidate != null && active === candidate;
}

export function usableRequestResponse(active, candidate, stopped = false) {
  return !stopped && ownsRequest(active, candidate) && candidate.signal?.aborted !== true;
}

// Only repaint fixtures when the meaning of the Today tab changes.
export function calendarDayChanged(previousDay, nextDay) {
  return typeof previousDay === 'string' && typeof nextDay === 'string'
    && previousDay !== nextDay;
}

// Look up a keyboard-focused action without placing note IDs into a CSS selector.
// IDs from imported backups may contain CSS metacharacters.
export function matchingQuickAction(container, noteId, flag) {
  if (!container?.querySelectorAll || typeof noteId !== 'string') return null;
  const actions = container.querySelectorAll('[data-quick-id][data-quick-flag]');
  for (const action of actions) {
    if (action.dataset?.quickId === noteId && action.dataset?.quickFlag === flag && !action.disabled) return action;
  }
  return null;
}

// Scheduled -> possible -> unconfirmed can change purely with the clock,
// even when a cached football response remains inside its refresh window.
export function fixtureStatusBoundaryCrossed(matches, lastRenderedAt, now) {
  if (!Array.isArray(matches) || !Number.isFinite(lastRenderedAt) || !Number.isFinite(now)
    || lastRenderedAt <= 0 || now <= lastRenderedAt) return false;
  return matches.some(match => {
    if (!match || match.finished === true) return false;
    const start = Date.parse(match.time);
    if (!Number.isFinite(start)) return false;
    return (lastRenderedAt < start && now >= start)
      || (lastRenderedAt <= start + 3 * 60 * 60_000 && now > start + 3 * 60 * 60_000);
  });
}
