/** MyHub v4.9: small, pure foreground-refresh decisions. No personal data is stored. */
export const WEATHER_REFRESH_MS = 30 * 60 * 1000;

/** Never duplicate an identical forecast fetch after Android wakes the PWA. */
export function forecastRefreshDecision({now, fetchedAt, valid=false, online=true, inFlight=false, force=false}={}) {
  if (!online) return 'offline';
  if (inFlight && !force) return 'pending';
  if (!force && valid && typeof fetchedAt === 'string') {
    const fetched = Date.parse(fetchedAt);
    // A future or malformed timestamp is NOT proof that cached data is fresh.
    if (Number.isFinite(now) && Number.isFinite(fetched) && fetched <= now && now - fetched < WEATHER_REFRESH_MS) return 'fresh';
  }
  return 'fetch';
}

/** Manual historical SportScore selection remains selected across midnight. */
export function sportScoreDayOnReturn({previousToday, currentToday, selectedDay, followToday=false}={}) {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(previousToday||'') || !day.test(currentToday||'') || !day.test(selectedDay||'')) return selectedDay;
  return followToday && previousToday !== currentToday ? currentToday : selectedDay;
}
