import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, TOOLS } from '../js/config.js';
import { translate } from '../js/i18n.js';
import { validateBackup } from '../js/db.js';
import { monthCells, occursOn, eventsForDay, daysInMonth, parseYmd, shiftDay,
  validCalendarEvent, validCalendarData, emptyCalendar, monthEventCounts } from '../js/calendar-core.js';

function event(date='2026-11-20',repeat='none',extra={}){
  return {id:'evt-1',title:'An appointment',details:'Private',date,time:'10:30',repeat,repeatUntil:'',
    createdAt:'2026-11-20T12:00:00.000Z',updatedAt:'2026-11-20T12:00:00.000Z',...extra};
}
const legacyBackup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['notes','calculator'],timeZones:['Europe/London']},calcHistory:[]}});

test('calendar month grid begins on Monday; November 2026 has 42 cells',()=>{
  const cells=monthCells(2026,11);
  assert.equal(cells.length,42);
  assert.equal(cells[0],'2026-10-26');
  assert.equal(cells.at(-1),'2026-12-06');
  assert.equal(monthCells(2027,5).length,42);
});
test('date validation prevents overflow and nonexistent days',()=>{
  for(const wrong of ['2026-02-29','2026-04-31','2026-00-01','2026-13-01','0000-01-01','hello','2026-1-2'])assert.equal(parseYmd(wrong),null);
  assert.deepEqual(parseYmd('2028-02-29'),{year:2028,month:2,day:29});
  assert.equal(daysInMonth(2028,2),29);
  assert.equal(shiftDay('2026-03-29',1),'2026-03-30'); // UK DST boundary cannot shift a date-only event
  assert.equal(shiftDay('2026-10-25',1),'2026-10-26');
  assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
});
test('daily repeats honour start and optional inclusive end date',()=>{
  const e=event('2026-11-20','daily',{repeatUntil:'2026-11-23'});
  assert.equal(occursOn(e,'2026-11-19'),false);
  for(const d of ['2026-11-20','2026-11-21','2026-11-22','2026-11-23'])assert.equal(occursOn(e,d),true);
  assert.equal(occursOn(e,'2026-11-24'),false);
});
test('weekly recurrence uses calendar days even across daylight saving',()=>{
  const e=event('2026-03-22','weekly');
  assert.equal(occursOn(e,'2026-03-29'),true);
  assert.equal(occursOn(e,'2026-04-05'),true);
  assert.equal(occursOn(e,'2026-03-30'),false);
});
test('monthly on 31st skips short months; 29 February repeats only leap years',()=>{
  const monthly=event('2026-01-31','monthly');
  assert.equal(occursOn(monthly,'2026-02-28'),false);
  assert.equal(occursOn(monthly,'2026-03-31'),true);
  assert.equal(occursOn(monthly,'2026-04-30'),false);
  const yearly=event('2028-02-29','yearly');
  assert.equal(occursOn(yearly,'2029-02-28'),false);
  assert.equal(occursOn(yearly,'2032-02-29'),true);
});
test('single events only occur once; empty time sorts first',()=>{
  const e=event('2026-11-20','none');
  assert.equal(occursOn(e,'2026-11-21'),false);
  const allDay=event('2026-11-20','none',{id:'evt-all',title:'Birthday',time:''});
  assert.deepEqual(eventsForDay([e,allDay],'2026-11-20').map(x=>x.title),['Birthday','An appointment']);
  assert.equal(monthEventCounts([e,allDay],2026,11).get('2026-11-20'),2);
});
test('calendar schema rejects invalid title, repeated ID, oversized events and unsafe dates',()=>{
  assert.equal(validCalendarData(emptyCalendar()),true);
  assert.equal(validCalendarEvent(event()),true);
  for(const mutate of [
    e=>e.title='', e=>e.title='<'.repeat(121),e=>e.date='2026-02-30',
    e=>e.time='25:99',e=>e.repeat='hourly',e=>e.repeatUntil='2026-01-01',
    e=>e.details='x'.repeat(3001),e=>e.id='<img onerror=alert(1)>',
    e=>e.createdAt='bad',e=>e.updatedAt=null,
  ]){const e=event();mutate(e);assert.equal(validCalendarEvent(e),false,mutate.toString());}
  assert.equal(validCalendarData({schema:1,events:[event(),event()]}),false);
  assert.equal(validCalendarData({schema:2,events:[]}),false);
  assert.equal(validCalendarData({schema:1,events:Array.from({length:1001},(_,i)=>event('2026-11-20','none',{id:'e'+i}))}),false);
});
test('backups from v0.1, v0.2 and v0.3 remain accepted with an empty calendar',()=>{
  for(const b of [legacyBackup(),{...legacyBackup(),data:{...legacyBackup().data,weatherCache:{}}}]){
    assert.deepEqual(validateBackup(b).calendarData,emptyCalendar());
  }
  const newer=legacyBackup();newer.data.timerData=undefined;delete newer.data.timerData;
  assert.deepEqual(validateBackup(newer).calendarData,emptyCalendar());
});
test('v0.4 backup contains calendar, rejects corrupt input before restore',()=>{
  const b=legacyBackup();b.data.calendarData={schema:1,events:[event()]};
  assert.equal(validateBackup(b).calendarData.events[0].title,'An appointment');
  b.data.calendarData.events[0].date='not a date';
  assert.throws(()=>validateBackup(b),/calendar|календар/i);
});
test('module, stylesheet, worker and translations are correctly linked',()=>{
  assert.equal(VERSION,'1.4.0');
  assert.ok(TOOLS.some(x=>x.id==='calendar'));
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const mod=readFileSync(new URL('../js/calendar.js',import.meta.url),'utf8');
  assert.ok(app.includes('mountCalendar'));
  assert.ok(app.includes("route==='calendar'"));
  for(const path of ['js/calendar.js','js/calendar-core.js','calendar.css'])assert.ok(sw.includes(path));
  assert.ok(html.includes('calendar.css'));
  assert.ok(sw.includes('myhub-shell-v1.4.0'));
  for(const [,key] of mod.matchAll(/\bt\('([A-Za-z0-9]+)'\)/g)){
    assert.notEqual(translate('bg')(key),key,`BG missing ${key}`);
    assert.notEqual(translate('en')(key),key,`EN missing ${key}`);
  }
  for(const type of ['None','Daily','Weekly','Monthly','Yearly']){
    const key='calendarRepeat'+type;
    assert.notEqual(translate('bg')(key),key);
    assert.notEqual(translate('en')(key),key);
  }
});
