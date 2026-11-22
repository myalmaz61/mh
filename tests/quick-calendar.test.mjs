import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildQuickCalendarEvent} from '../js/quick-add-core.js';
import {calendarDuplicateDraft, validCalendarEvent, validCalendarData, occursOn, MAX_CALENDAR_EVENTS} from '../js/calendar-core.js';
import {appendQuickCalendarEvent, validateBackup} from '../js/db.js';
import {translate} from '../js/i18n.js';
import {VERSION} from '../js/config.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stamp='2026-11-22T12:00:00.000Z';
const options={id:'example-1',now:stamp};
const mk=(id,others={})=>buildQuickCalendarEvent({title:'Appointment',date:'2026-11-23',...others},{id,now:stamp});

test('Quick Add creates a real Calendar v1 event, with an all-day default',()=>{
  const entry=buildQuickCalendarEvent({title:'  Dentist  ',details:'  Call ahead  ',date:'2026-11-23'},options);
  assert.deepEqual(entry,{id:'example-1',title:'Dentist',details:'Call ahead',date:'2026-11-23',time:'',repeat:'none',repeatUntil:'',createdAt:stamp,updatedAt:stamp});
  assert.equal(validCalendarEvent(entry),true);
  assert.equal(validCalendarData({schema:1,events:[entry]}),true);
});
test('Quick Add accepts local time and recurrence and does not invent an end date',()=>{
  const e=buildQuickCalendarEvent({title:'Reminder',date:'2026-11-23',time:'15:40',repeat:'weekly'},options);
  assert.equal(e.time,'15:40');assert.equal(e.repeat,'weekly');assert.equal(e.repeatUntil,'');
  assert.equal(occursOn(e,'2026-11-30'),true);
  assert.equal(occursOn(e,'2026-11-24'),false);
});
test('Quick Add rejects impossible dates, times, invalid recurrence and oversized fields',()=>{
  for(const candidate of [
    {title:'  ',date:'2026-11-23'},
    {title:'X'.repeat(121),date:'2026-11-23'},
    {title:'X',date:'2026-02-30'},
    {title:'X',date:'2026-11-23',time:'24:30'},
    {title:'X',date:'2026-11-23',repeat:'hourly'},
    {title:'X',date:'2026-11-23',details:'X'.repeat(3001)},
  ]) assert.throws(()=>buildQuickCalendarEvent(candidate,options),/Invalid quick calendar/);
});
test('Quick Add supports February 29 only in leap years',()=>{
  assert.equal(buildQuickCalendarEvent({title:'A',date:'2028-02-29'},options).date,'2028-02-29');
  assert.throws(()=>buildQuickCalendarEvent({title:'A',date:'2027-02-29'},options));
});
test('Duplication creates an unsaved single event on the viewed date',()=>{
  const parent=mk('parent',{title:'Weekly call',details:'Same agenda',repeat:'weekly',time:'12:30'});
  const clone=calendarDuplicateDraft(parent,'2026-12-07');
  assert.deepEqual(clone,{title:'Weekly call',details:'Same agenda',date:'2026-12-07',time:'12:30',repeat:'none',repeatUntil:''});
  assert.equal(clone.id,undefined);
  assert.equal(parent.repeat,'weekly');
  const newEvent=buildQuickCalendarEvent(clone,{id:'new-id',now:stamp});
  assert.equal(validCalendarData({schema:1,events:[parent,newEvent]}),true);
});
test('Duplication rejects malformed stored events and invalid viewed dates',()=>{
  assert.throws(()=>calendarDuplicateDraft({...mk('one'),date:'2026-02-30'},'2026-12-01'));
  assert.throws(()=>calendarDuplicateDraft(mk('two'),'2026-13-01'));
});

// A small deterministic IndexedDB transaction double proves that a Quick Add
// appends to current stored events rather than overwriting a stale snapshot.
const records=new Map();
const db={
  transaction(name,mode){
    assert.equal(name,'meta');assert.equal(mode,'readwrite');
    let aborted=false;
    const tx={
      objectStore(){return {
        get(key){const req={};queueMicrotask(()=>{
          req.result=records.has(key)?{key,value:structuredClone(records.get(key))}:undefined;
          req.onsuccess?.();
          queueMicrotask(()=>{if(!aborted)tx.oncomplete?.();});
        });return req;},
        put(obj){if(aborted)throw Error('put after abort');records.set(obj.key,structuredClone(obj.value));}
      };},
      abort(){aborted=true;queueMicrotask(()=>tx.onabort?.());}
    };
    return tx;
  }
};
globalThis.indexedDB={open(name,version){
  assert.equal(name,'myhub-local');assert.equal(version,1);
  const req={result:db};queueMicrotask(()=>req.onsuccess?.());return req;
}};

test('Atomic append preserves existing calendar events',async()=>{
  records.clear();
  const old=mk('old',{title:'Old'});
  records.set('calendarData',{schema:1,events:[old]});
  await appendQuickCalendarEvent(mk('new',{title:'New'}));
  assert.deepEqual(records.get('calendarData').events.map(e=>e.title),['Old','New']);
  await appendQuickCalendarEvent(mk('next',{title:'Next'}));
  assert.deepEqual(records.get('calendarData').events.map(e=>e.id),['old','new','next']);
});
test('Atomic append refuses corrupt data, leaving bytes untouched',async()=>{
  const damaged={schema:1,events:[{title:'invalid'}]};
  records.set('calendarData',structuredClone(damaged));
  await assert.rejects(appendQuickCalendarEvent(mk('insert')),/corrupt/);
  assert.deepEqual(records.get('calendarData'),damaged);
});
test('Atomic append refuses duplicate event IDs without altering data',async()=>{
  const existing={schema:1,events:[mk('same')]};records.set('calendarData',existing);
  await assert.rejects(appendQuickCalendarEvent(mk('same')),/duplicate/);
  assert.deepEqual(records.get('calendarData'),existing);
});
test('Atomic append respects maximum 1000 calendar entries',async()=>{
  const existing={schema:1,events:Array.from({length:MAX_CALENDAR_EVENTS},(_,i)=>mk('event-'+i))};
  records.set('calendarData',existing);
  await assert.rejects(appendQuickCalendarEvent(mk('extra')),/limit/);
  assert.equal(records.get('calendarData').events.length,MAX_CALENDAR_EVENTS);
});
test('The new event remains part of the existing version-1 backup without migration',()=>{
  const payload={app:'MyHub',format:1,createdAt:stamp,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['calculator'],timeZones:['Europe/London']},calcHistory:[],calendarData:{schema:1,events:[mk('new')]}}};
  assert.equal(validateBackup(payload).calendarData.events[0].id,'new');
  assert.equal(VERSION,'2.2.0');
});
test('New UI fields and translations are present in the offline app',()=>{
  const mod=read('js/quick-add.js');const cal=read('js/calendar.js');const sw=read('sw.js');
  const code=read('js/db.js');const css=read('quick-add.css');
  assert.match(mod,/data-quick-kind="calendar"/);
  assert.match(mod,/appendQuickCalendarEvent\(record\)/);
  assert.match(mod,/openRecord\(route,\{id:record.id\}\)/);
  assert.match(mod,/calendarFields\.querySelectorAll\('input,select'\)/);
  assert.match(css,/#quick-add-calendar-fields\[hidden\]\{display:none!important\}/);
  assert.match(cal,/calendarDuplicateDraft\(original,selected\)/);
  assert.match(code,/!validCalendarData\(existing\)/);
  assert.match(sw,/myhub-shell-v2\.2\.0/);
  for(const key of ['quickAddCalendar','quickAddDate','quickAddTime','quickAddRepeat','quickAddCorruptCalendar','calendarDuplicate']){
    assert.notEqual(translate('bg')(key),key,key);
    assert.notEqual(translate('en')(key),key,key);
  }
});
