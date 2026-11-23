/** Brief, neutral probability summary from cached Open-Meteo hourly values. */
export function upcomingRainSummary(hours, count = 3) {
  if (!Array.isArray(hours) || !Number.isInteger(count) || count < 1 || count > 12) return null;
  const eligible = hours.slice(0, count).filter(hour =>
    hour && typeof hour.time === 'string' &&
    typeof hour.prob === 'number' && Number.isFinite(hour.prob) && hour.prob >= 0 && hour.prob <= 100);
  if (!eligible.length) return null;
  return {count: eligible.length, maxProbability: Math.max(...eligible.map(hour => hour.prob))};
}

/** First hour with >= threshold% precipitation probability, from saved local-city hours. */
export function rainChanceWindow(hours, threshold = 50) {
  if (!Array.isArray(hours) || !hours.length || !Number.isInteger(threshold) || threshold < 1 || threshold > 100) return null;
  const values = hours.slice(0,12);
  if (values.some(h => !h || typeof h.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(h.time) ||
      typeof h.prob !== 'number' || !Number.isFinite(h.prob) || h.prob < 0 || h.prob > 100)) return null;
  const firstHigh=values.find(h=>h.prob>=threshold) || null;
  return {count:values.length, threshold, firstTime:firstHigh?.time ?? null, firstProbability:firstHigh?.prob ?? null,
    maxProbability:Math.max(...values.map(h=>h.prob))};
}
