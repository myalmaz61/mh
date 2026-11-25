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


/** Describe the exact city-local range of forecast rows without treating gaps
 * (including daylight-saving clock jumps) as a continuous period. This is
 * presentation-only: the caller never changes the stored API snapshot.
 */
export function weatherQuickTiming(quick, currentTime) {
  if (!quick || !Array.isArray(quick.hours) || !quick.hours.length || quick.hours.length > 12 ||
      !goodLocalTime(currentTime)) return null;
  const base = Date.parse(currentTime.slice(0,13) + ':00:00Z');
  if (!Number.isFinite(base)) return null;
  let previous = -Infinity, first = '', last = '', incomplete = false;
  for (const entry of quick.hours) {
    if (!entry || !goodLocalTime(entry.time)) return null;
    const stamp=Date.parse(entry.time + ':00Z');
    if (!Number.isFinite(stamp) || stamp <= previous || stamp < base) return null;
    if (previous !== -Infinity && stamp - previous !== 3_600_000) incomplete = true;
    if (!first) first=entry.time;
    last=entry.time;previous=stamp;
  }
  if (Date.parse(first+':00Z')-base > 3_600_000) incomplete=true;
  const acrossDays = first.slice(0,10) !== last.slice(0,10) || first.slice(0,10) !== currentTime.slice(0,10);
  const label=s=> acrossDays ? `${s.slice(8,10)}.${s.slice(5,7)} ${s.slice(11,16)}` : s.slice(11,16);
  return {start:label(first),end:label(last),incomplete};
}
