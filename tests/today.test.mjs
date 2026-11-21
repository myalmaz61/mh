import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { todaySummary } from '../js/today-core.js';
import { dataHealth, formatBytes } from '../js/diagnostics-core.js';
import { emptyCalendar } from '../js/calendar-core.js';
import { emptyTasks } from '../js/tasks-core.js';
import { emptyBookmarks } from '../js/bookmarks-core.js';
import { validateBackup } from '../js/db.js';
import { VERSION } from '../js/config.js';
const stamp='2026-11-20T12:00:00.000Z';
const task=(id,due,done=false,title=id)=>({id,title,details:'',due,priority:'normal',done,createdAt:stamp,updatedAt:stamp});
const event=(id,date,repeat='none',time='')=>({id,title:id,details:'',date,time,repeat,repeatUntil:'',createdAt:stamp,updatedAt:stamp});

test('Today shows only pending due or overdue tasks, not future and completed',()=>{
  const tasks={schema:1,tasks:[task('overdue','2026-11-19'),task('today','2026-11-20'),task('future','2026-11-21'),task('done','2026-11-20',true),task('unscheduled','')]};
  const s=todaySummary(tasks,emptyCalendar(),'2026-11-20');
  assert.deepEqual(s.tasks.map(x=>x.id),['overdue','today']);assert.equal(s.overdue,1);
  assert.equal(tasks.tasks.length,5);
});
test('Today includes recurring events on the right day, even around DST',()=>{
  const data={schema:1,events:[event('weekly','2026-11-13','weekly','09:00'),event('monthly','2026-10-20','monthly'),event('future','2026-11-21')]};
  const s=todaySummary(emptyTasks(),data,'2026-11-20');
  assert.deepEqual(s.events.map(x=>x.id),['monthly','weekly']);
});
test('Today monthly recurrence skips missing calendar days',()=>{
  const data={schema:1,events:[event('thirtyone','2026-01-31','monthly')]};
  assert.equal(todaySummary(undefined,data,'2026-02-28').events.length,0);
  assert.equal(todaySummary(undefined,data,'2026-03-31').events.length,1);
});
test('Today handles missing old data as empty without creating anything',()=>{
  const s=todaySummary(undefined,undefined,'2026-11-20');assert.equal(s.tasks.length,0);assert.equal(s.events.length,0);
});
test('Today rejects corrupt data without writing it',()=>{
  assert.throws(()=>todaySummary({schema:1,tasks:[{id:'x'}]},undefined,'2026-11-20'));
  assert.throws(()=>todaySummary(undefined,{schema:1,events:[{id:'e'}]},'2026-11-20'));
  assert.throws(()=>todaySummary(undefined,undefined,'2026-02-30'));
});
test('storage diagnostics accepts valid v0.8 data safely',()=>{
  const s=dataHealth({notes:[{id:'1'}],tasksData:{schema:1,tasks:[task('a','')]},calendarData:{schema:1,events:[event('e','2026-11-20')]},bookmarksData:emptyBookmarks()});
  assert.deepEqual(s,{notes:1,tasks:1,events:1,bookmarks:0});
});
test('storage diagnostics rejects damaged collections, no mutation',()=>{
  assert.throws(()=>dataHealth({notes:[],tasksData:{schema:1,tasks:[task('id','2026-02-30')]}}));
  assert.throws(()=>dataHealth({notes:[],bookmarksData:{schema:1,items:[{url:'javascript:evil'}]}}));
  assert.deepEqual(dataHealth({notes:[]}),{notes:0,tasks:0,events:0,bookmarks:0});
});
test('storage diagnostic bytes are formatted and invalid values are safe',()=>{
  assert.equal(formatBytes(1048576,'en'),'1 MB');assert.equal(formatBytes(-100),'—');
});
test('v0.9 shell references new module assets and bump',()=>{
  assert.equal(VERSION,'1.1.0');
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.ok(index.includes('today.css'));
  for(const asset of ['myhub-shell-v1.1.0','./today.css','./js/today.js','./js/today-core.js','./js/diagnostics.js','./js/diagnostics-core.js'])assert.ok(sw.includes(asset),asset);
  assert.ok(app.includes('id="today-summary-slot"'));assert.ok(app.includes('id="health-section"'));
});
test('v0.8 backup with no v0.9 metadata restores without migration',()=>{
  const b={app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['notes'],timeZones:['Europe/Sofia']},calcHistory:[]}};
  const data=validateBackup(b);assert.deepEqual(data.notes,[]);assert.deepEqual(data.tasksData,emptyTasks());
});
