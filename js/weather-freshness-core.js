/** Treat saved forecasts as historical data once they become too old.
 * Never assume that navigator.onLine proves the API is reachable.
 * This helper is pure and independent of the phone's timezone.
 */
export const WEATHER_FRESH_MS = 30 * 60_000;
export const WEATHER_OUTDATED_MS = 6 * 60 * 60_000;

export function weatherSnapshotFreshness(fetchedAt, now = Date.now()) {
  const time = typeof fetchedAt === 'string' ? Date.parse(fetchedAt) : NaN;
  if (!Number.isFinite(time) || !Number.isFinite(now)) return {state:'outdated', ageMinutes:null};
  const elapsed = now - time;
  // A small future skew can occur if a device clock is adjusted. Large clock
  // anomalies are not evidence that the forecast is fresh.
  if (elapsed < -5 * 60_000) return {state:'outdated',ageMinutes:null};
  const ageMinutes = Math.max(0,Math.floor(elapsed / 60_000));
  return {
    state: elapsed <= WEATHER_FRESH_MS ? 'fresh'
      : elapsed <= WEATHER_OUTDATED_MS ? 'cached' : 'outdated',
    ageMinutes
  };
}
