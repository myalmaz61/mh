/** Local date-only calendar logic. No Date.parse for recurring dates; no network. */
export const MAX_CALENDAR_EVENTS = 1000;
export const CALENDAR_REPEATS = Object.freeze(['none','daily','weekly','monthly','yearly']);
const pad=n=>String(n).padStart(2,'0');
const boundedYear=y=>Number.isInteger(y)&&y>=1900&&y<=2100;
export const formatYmd=(year,month,day)=>`${year}-${pad(month)}-${pad(day)}`;
export function parseYmd(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [y,m,d]=value.split('-').map(Number);
  if(!boundedYear(y)||m<1||m>12||d<1||d>daysInMonth(y,m))return null;
  return {year:y,month:m,day:d};
}
export function daysInMonth(year,month){
  if(!boundedYear(year)||!Number.isInteger(month)||month<1||month>12)return 0;
  return new Date(Date.UTC(year,month,0)).getUTCDate();
}
export function todayLocal(date=new Date()) {return formatYmd(date.getFullYear(),date.getMonth()+1,date.getDate());}
export function shiftDay(value,days){
  const p=parseYmd(value);
  if(!p||!Number.isInteger(days)||Math.abs(days)>40000)return null;
  const d=new Date(Date.UTC(p.year,p.month-1,p.day+days));
  return boundedYear(d.getUTCFullYear())?formatYmd(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()):null;
}
export const isTime=value=>typeof value==='string'&&(value===''||(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)));
const validISO=value=>typeof value==='string'&&value.length<=32&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
export function validCalendarEvent(e){
  if(!e||typeof e!=='object'||Array.isArray(e)||
      typeof e.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(e.id)||
      typeof e.title!=='string'||!e.title.trim()||e.title.length>120||
      typeof e.details!=='string'||e.details.length>3000||
      !parseYmd(e.date)||!isTime(e.time)||
      !CALENDAR_REPEATS.includes(e.repeat)||
      !(e.repeatUntil===''||(parseYmd(e.repeatUntil)&&e.repeatUntil>=e.date))||
      !validISO(e.createdAt)||!validISO(e.updatedAt))return false;
  return true;
}
export function validCalendarData(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1||
     !Array.isArray(value.events)||value.events.length>MAX_CALENDAR_EVENTS)return false;
  const ids=new Set();
  for(const e of value.events){if(!validCalendarEvent(e)||ids.has(e.id))return false;ids.add(e.id);}
  return true;
}
export const emptyCalendar=()=>({schema:1,events:[]});
const utcDay=p=>Date.UTC(p.year,p.month-1,p.day)/86400000;
export function occursOn(event,date){
  if(!validCalendarEvent(event))return false;
  const target=parseYmd(date),start=parseYmd(event.date);
  if(!target||date<event.date||(event.repeatUntil&&date>event.repeatUntil))return false;
  if(date===event.date)return true;
  const diffDays=utcDay(target)-utcDay(start);
  switch(event.repeat){
    case 'daily':return true;
    case 'weekly':return diffDays%7===0;
    case 'monthly':return target.day===start.day &&
      (target.year-start.year)*12+target.month-start.month>=0;
    case 'yearly':return target.month===start.month&&target.day===start.day;
    default:return false;
  }
}
export function eventsForDay(events,date){
  return events.filter(e=>occursOn(e,date)).sort((a,b)=>{
    const byTime=a.time===b.time?0:a.time===''?-1:b.time===''?1:a.time.localeCompare(b.time);
    return byTime || a.title.localeCompare(b.title);
  });
}
export function monthCells(year,month){
  if(!boundedYear(year)||!Number.isInteger(month)||month<1||month>12)return [];
  const first=new Date(Date.UTC(year,month-1,1));
  const offset=(first.getUTCDay()+6)%7;
  const count=Math.ceil((offset+daysInMonth(year,month))/7)*7;
  const cells=[];
  for(let i=0;i<count;i++){
    const d=new Date(Date.UTC(year,month-1,1-offset+i));
    cells.push(formatYmd(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()));
  }
  return cells;
}
export function monthEventCounts(events,year,month){
  const result=new Map();
  for(const date of monthCells(year,month))result.set(date,eventsForDay(events,date).length);
  return result;
}
