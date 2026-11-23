/** Pure conversion for displaying cached Open-Meteo hourly probability bars.
 * Unknown probability is NOT mapped to 0%, and no network request is required.
 */
export function hourlyProbabilityBar(probability) {
  if (probability === null || probability === undefined) return null;
  if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 100) return null;
  return Math.round(probability);
}
