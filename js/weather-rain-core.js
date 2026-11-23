/** Brief, neutral probability summary from cached Open-Meteo hourly values. */
export function upcomingRainSummary(hours, count = 3) {
  if (!Array.isArray(hours) || !Number.isInteger(count) || count < 1 || count > 12) return null;
  const eligible = hours.slice(0, count).filter(hour =>
    hour && typeof hour.time === 'string' &&
    typeof hour.prob === 'number' && Number.isFinite(hour.prob) && hour.prob >= 0 && hour.prob <= 100);
  if (!eligible.length) return null;
  return {count: eligible.length, maxProbability: Math.max(...eligible.map(hour => hour.prob))};
}
