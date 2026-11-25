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

/** Validate a genuinely consecutive city-local probability window.
 * This is used by the on-screen "next hours" summary; missing values, skipped
 * hours, stale snapshots (checked by caller), or distant first hours must NOT
 * be presented as a reliable next-hours overview. This does not alter the data.
 * The optional minimum permits an extended (up to 12 hour) window to be shorter
 * near the end of an API response while the headline always needs 3 full hours.
 */
export function reliableRainHours(hours,currentLocalTime,count=3,minimum=count) {
  if(!Array.isArray(hours) || !Number.isInteger(count) || count<1 || count>12 ||
     !Number.isInteger(minimum) || minimum<1 || minimum>count ||
     typeof currentLocalTime!=='string' ||
     !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(currentLocalTime)) return null;
  const dateValid=iso=>{
    const d=new Date(iso.slice(0,10)+'T12:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso.slice(0,10);
  };
  if(!dateValid(currentLocalTime))return null;
  const baseline=Date.parse(currentLocalTime.slice(0,13)+':00:00Z');
  const rows=hours.slice(0,count);
  if(rows.length<minimum)return null;
  let previous=null;
  for(const row of rows){
    if(!row || typeof row.time!=='string' ||
       !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time) ||
       !dateValid(row.time) || typeof row.prob!=='number' || !Number.isFinite(row.prob) || row.prob<0 || row.prob>100)return null;
    const timestamp=Date.parse(row.time+':00Z');
    if(previous===null){
      if(timestamp<baseline||timestamp-baseline>3_600_000)return null;
    } else if(timestamp-previous!==3_600_000)return null;
    previous=timestamp;
  }
  return rows.map(row=>({time:row.time,prob:row.prob}));
}
