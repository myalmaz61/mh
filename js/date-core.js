// UTC midnight arithmetic avoids DST-related off-by-one errors.
const DAY=86400000;
export function parseIsoDay(value){
  if(typeof value!=='string'|| !/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Invalid date');
  const [y,m,d]=value.split('-').map(Number);
  if(y<1900||y>2100||m<1||m>12||d<1||d>31)throw Error('Date out of range');
  const stamp=Date.UTC(y,m-1,d);
  const date=new Date(stamp);
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error('Invalid date');
  return stamp;
}
export function toIsoDay(stamp){
  if(!Number.isFinite(stamp))throw Error('Invalid date');
  return new Date(stamp).toISOString().slice(0,10);
}
export function daysBetween(start,end){return Math.round((parseIsoDay(end)-parseIsoDay(start))/DAY);}
export function addDays(day,count){
  if(!Number.isInteger(count)||Math.abs(count)>100000)throw Error('Invalid days');
  const result=parseIsoDay(day)+count*DAY;
  const y=new Date(result).getUTCFullYear();
  if(y<1900||y>2100)throw Error('Date out of range');
  return toIsoDay(result);
}
export function weekdaysBetween(start,end){
  let a=parseIsoDay(start),b=parseIsoDay(end),sign=1;
  if(a>b){[a,b]=[b,a];sign=-1;}
  const days=Math.round((b-a)/DAY),fullWeeks=Math.floor(days/7);
  let weekdays=fullWeeks*5;
  for(let i=0;i<days%7;i++){
    const wd=new Date(a+(fullWeeks*7+i)*DAY).getUTCDay();
    if(wd!==0&&wd!==6)weekdays++;
  }
  return weekdays*sign;
}
export function todayIsoLocal(now=new Date()){
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}
