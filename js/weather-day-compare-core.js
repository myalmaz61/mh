/** Compare cached *city-local* hourly data for forecast date and following date.
 * Unknown probability stays unknown. Old 12-hour cache remains supported.
 * Pure function: no network or timezone-conversion guesswork.
 */
export function weatherDayComparison(hours, currentTime) {
  if(!Array.isArray(hours)||typeof currentTime!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(currentTime))return null;
  const date=currentTime.slice(0,10);
  const utc=new Date(`${date}T12:00:00Z`);
  if(!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0,10)!==date)return null;
  utc.setUTCDate(utc.getUTCDate()+1);
  const tomorrow=utc.toISOString().slice(0,10);
  return [date,tomorrow].map(day=>{
    const rows=hours.filter(h=>h && typeof h.time==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(h.time) &&
      h.time.slice(0,10)===day && h.time>=currentTime &&
      (h.prob===null || (typeof h.prob==='number' && Number.isFinite(h.prob) && h.prob>=0 && h.prob<=100)) &&
      (h.temp===null || (typeof h.temp==='number' && Number.isFinite(h.temp) && h.temp>=-100 && h.temp<=80)) &&
      (h.wind===undefined || h.wind===null || (typeof h.wind==='number' && Number.isFinite(h.wind) && h.wind>=0 && h.wind<=500)))
      .slice().sort((a,b)=>a.time.localeCompare(b.time));
    const chances=rows.map(h=>h.prob).filter(v=>typeof v==='number');
    const temperatures=rows.map(h=>h.temp).filter(v=>typeof v==='number');
    const winds=rows.map(h=>h.wind).filter(v=>typeof v==='number');
    return {date:day,hours:rows,maxProbability:chances.length?Math.max(...chances):null,
      minTemperature:temperatures.length?Math.min(...temperatures):null,
      maxTemperature:temperatures.length?Math.max(...temperatures):null,
      maxWind:winds.length?Math.max(...winds):null};
  });
}
