/** MyHub v5.4.0 — short, conservative interpretation of already cached Open-Meteo hours.
 * Input is the *validated* weatherQuickOutlook result; no network, storage or timezone APIs.
 * Probability is not certainty; wind bands are descriptive, NOT official weather warnings.
 * Missing observations stay unknown. Never use this interpretation with an old snapshot.
 */
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const localHour = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(s) &&
  Number.isFinite(Date.parse(s.slice(0,10) + 'T12:00:00Z')) &&
  new Date(s.slice(0,10) + 'T12:00:00Z').toISOString().slice(0,10) === s.slice(0,10);

export function weatherPracticalSummary(quick) {
  if (!quick || !Array.isArray(quick.hours) || quick.hours.length < 1 || quick.hours.length > 12) return null;
  // Bad or duplicated entries should not make an apparently authoritative summary.
  let previous = '';
  for (const row of quick.hours) {
    if (!row || !localHour(row.time) || (previous && row.time <= previous) ||
      !(row.prob == null || finite(row.prob,0,100)) ||
      !(row.wind == null || finite(row.wind,0,500)) ||
      !(row.temp == null || finite(row.temp,-100,80))) return null;
    previous = row.time;
  }
  const rows = quick.hours;
  // Never turn partial hourly coverage into a claim of low rain, weak wind,
  // or a steady trend. Values shown in the detailed hourly table remain intact.
  const completeRain=rows.every(x=>finite(x.prob,0,100));
  const completeWind=rows.every(x=>finite(x.wind,0,500));
  const completeTemp=rows.every(x=>finite(x.temp,-100,80));
  const withRain=completeRain ? rows : [];
  const withWind=completeWind ? rows : [];
  const withTemp=completeTemp ? rows : [];
  const peakRain=withRain.length ? Math.max(...withRain.map(x=>x.prob)) : null;
  const highRain=withRain.find(x=>x.prob >= 50) || null;
  const peakWind=withWind.length ? Math.max(...withWind.map(x=>x.wind)) : null;
  // Across midnight HH:mm alone can refer to the wrong day. Keep the date in
  // the first-high-rain label only when it differs from the first row's date.
  const firstHighTime=highRain ? (
    highRain.time.slice(0,10)===rows[0].time.slice(0,10)
      ? highRain.time.slice(11,16)
      : `${highRain.time.slice(8,10)}.${highRain.time.slice(5,7)} ${highRain.time.slice(11,16)}`
  ) : null;
  const first=withTemp[0],last=withTemp[withTemp.length-1];
  // A trend from widely separated observations is not a next-hours prediction.
  const span=first && last ? (Date.parse(last.time+':00Z')-Date.parse(first.time+':00Z'))/3_600_000 : null;
  const hasTrend=withTemp.length>=2 && span>=1 && span<=6;
  const delta=hasTrend ? Math.round((last.temp-first.temp)*10)/10 : null;
  return {
    count: rows.length,
    rain: {kind: peakRain===null ? 'unknown' : highRain ? 'higher' : peakRain>=20 ? 'some' : 'lower',
      peak:peakRain,firstHighTime},
    wind: {kind:peakWind===null?'unknown':peakWind>=40?'strong':peakWind>=25?'noticeable':'lower',peak:peakWind},
    temperature: {kind:delta===null?'unknown':delta<=-3?'cooling':delta>=3?'warming':'steady',change:delta===null?null:Math.abs(delta)},
  };
}
