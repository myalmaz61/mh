/** MyHub v3.5.0: a short summary of existing city-local hourly forecast data.
 * Pure function; no API call, device time-zone conversion or cache mutation.
 * Missing measurements remain null (never silently treated as zero).
 */
const HOUR = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const okNumber = (value, min, max) => value == null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
function goodLocalTime(s) {
  if (typeof s !== 'string' || !HOUR.test(s)) return false;
  const date = s.slice(0,10);
  const d = new Date(date + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === date;
}
export function weatherQuickOutlook(hours, currentTime, maxHours=4) {
  if (!Array.isArray(hours) || !goodLocalTime(currentTime) || !Number.isInteger(maxHours) || maxHours < 1 || maxHours > 12) return null;
  const floor = currentTime.slice(0,13)+':00';
  const unique = new Map();
  for (const h of hours) {
    if (!h || !goodLocalTime(h.time) || h.time < floor ||
        !okNumber(h.temp,-100,80) || !okNumber(h.prob,0,100) || !okNumber(h.wind,0,500)) continue;
    if (!unique.has(h.time)) unique.set(h.time,{time:h.time,temp:h.temp ?? null,prob:h.prob ?? null,wind:h.wind ?? null});
  }
  const rows = [...unique.values()].sort((a,b)=>a.time.localeCompare(b.time)).slice(0,maxHours);
  if (!rows.length) return null;
  const temperatures=rows.map(h=>h.temp).filter(v=>v!==null);
  const rains=rows.filter(h=>h.prob!==null);
  const winds=rows.filter(h=>h.wind!==null);
  const highest=(values,key)=>values.length?Math.max(...values.map(h=>h[key])):null;
  return {
    hours:rows,
    minTemperature:temperatures.length?Math.min(...temperatures):null,
    maxTemperature:temperatures.length?Math.max(...temperatures):null,
    peakRainProbability:highest(rains,'prob'),
    peakRainTime:rains.length?rows.find(h=>h.prob===highest(rains,'prob')).time:null,
    maxWind:highest(winds,'wind'),
  };
}
