/** MyHub v4.7: City-local highlights for the date of observation and the following day.
 * Only uses daily forecast rows already cached by Weather. No extra requests,
 * device time-zone conversion, or storage changes. Missing values stay null.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function validDate(date) {
  if (typeof date !== 'string' || !DAY.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === date;
}
function nextDate(day) {
  if (!validDate(day)) return null;
  const date=new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+1);
  return date.toISOString().slice(0,10);
}
const numberIn=(v,min,max)=>typeof v==='number' && Number.isFinite(v) && v>=min && v<=max;
export function weatherDayHighlights(daily, currentLocalTime) {
  if (!Array.isArray(daily) || daily.length<1 || daily.length>7 ||
      typeof currentLocalTime!=='string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(currentLocalTime)) return [];
  const today=currentLocalTime.slice(0,10), tomorrow=nextDate(today);
  if (!tomorrow) return [];
  const used=new Set();
  const result=[];
  for(const [date, label] of [[today,'today'],[tomorrow,'tomorrow']]) {
    const day=daily.find(d=>d?.date===date);
    if(!day || used.has(date) || !validDate(day.date) ||
       !numberIn(day.min,-100,80)||!numberIn(day.max,-100,80)||
       !numberIn(day.code,0,100)||
       !(day.prob==null||numberIn(day.prob,0,100))||
       !(day.rain==null||numberIn(day.rain,0,10000)))continue;
    used.add(date);
    result.push({label,date,min:day.min,max:day.max,prob:day.prob??null,
      rain:day.rain??null,code:day.code});
  }
  return result;
}
