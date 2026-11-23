import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completeTodayTaskData} from '../js/today-actions-core.js';
import {todaySummary} from '../js/today-core.js';
import {occursOn,emptyCalendar} from '../js/calendar-core.js';
import {completeTodayTask,getMeta} from '../js/db.js';
import {VERSION} from '../js/config.js';
const stamp='2026-11-22T10:00:00.000Z';
const newer='2026-11-22T10:01:00.000Z';
const task=(id='a',due='2026-11-22',overrides={})=>({id,title:'Buy milk',details:'Two litres',due,priority:'high',done:false,createdAt:stamp,updatedAt:stamp,...overrides});
const tasks=(...items)=>({schema:1,tasks:items});
const event={id:'meeting',title:'Team meeting',details:'',date:'2026-11-01',time:'12:30',repeat:'weekly',repeatUntil:'',createdAt:stamp,updatedAt:stamp};
const clone=value=>structuredClone(value);
const errorCode=(code)=>(err)=>err.code===code;

test('Today marks one pending task done without changing other tasks or fields',()=>{
  const input=tasks(task(),task('b','2026-11-23'));
  const old=clone(input);
  const next=completeTodayTaskData(input,'a',stamp,newer);
  assert.deepEqual(input,old);
  assert.equal(next.tasks[0].done,true);
  assert.equal(next.tasks[0].updatedAt,newer);
  assert.equal(next.tasks[0].priority,'high');
  assert.equal(next.tasks[0].details,'Two litres');
  assert.deepEqual(next.tasks[1],input.tasks[1]);
  assert.deepEqual(todaySummary(next,emptyCalendar(),'2026-11-22').tasks,[]);
});
test('Today rejects stale records instead of overwriting newer edits',()=>{
  const current=tasks(task('a','2026-11-22',{title:'Changed in Tasks',updatedAt:newer}));
  assert.throws(()=>completeTodayTaskData(current,'a',stamp,newer),errorCode('stale'));
  assert.equal(current.tasks[0].title,'Changed in Tasks');
});
test('Today rejects completed tasks',()=>assert.throws(()=>completeTodayTaskData(tasks(task('a','2026-11-22',{done:true})),'a',stamp,newer),errorCode('completed')));
test('Today rejects tasks deleted in another view',()=>assert.throws(()=>completeTodayTaskData(tasks(),'a',stamp,newer),errorCode('missing')));
test('Today rejects damaged task collections rather than recreating them',()=>assert.throws(()=>completeTodayTaskData({schema:1,tasks:[{id:'x'}]},'x',stamp,newer),errorCode('corrupt')));
test('Today validates new timestamps',()=>{
  for(const time of ['', 'garbage', '2099-19-10T00:00:00Z']){
    assert.throws(()=>completeTodayTaskData(tasks(task()),'a',stamp,time));
  }
});
test('Today does not complete a different ID',()=>{
  const data=tasks(task('a'),task('b'));
  assert.deepEqual(completeTodayTaskData(data,'b',stamp,newer).tasks.map(x=>x.done),[false,true]);
});
test('Today can finish an overdue task while leaving future dates alone',()=>{
  const input=tasks(task('late','2026-11-20'),task('future','2026-12-02'));
  const completed=completeTodayTaskData(input,'late',stamp,newer);
  const summary=todaySummary(completed,emptyCalendar(),'2026-11-22');
  assert.equal(summary.tasks.length,0);assert.equal(summary.overdue,0);
});
test('Recurring weekly calendar event has an occurrence on chosen Today date',()=>{
  assert.equal(occursOn(event,'2026-11-22'),true);
  assert.equal(occursOn(event,'2026-11-23'),false);
  const source=readFileSync(new URL('../js/calendar.js',import.meta.url),'utf8');
  assert.match(source,/showDay&&occursOn\(initialEvent,initialDate\)/);
  assert.match(source,/if\(!showDay\)\{editId=/);
});
test('Today button navigates to selected occurrence without calendar writes',()=>{
  const source=readFileSync(new URL('../js/today.js',import.meta.url),'utf8');
  assert.match(source,/openTool\('calendar',\{id:found.id,date:snapshot.date,showDay:true\}\)/);
  assert.doesNotMatch(source,/setMeta\('calendarData'/);
});
test('Today actions remain in collapsed details with explicit user interaction',()=>{
  const source=readFileSync(new URL('../js/today.js',import.meta.url),'utf8');
  assert.match(source,/data-today-complete/);
  assert.match(source,/<details class=\\?"hub-today-detail/);
  assert.match(source,/const click=async event=>/);
  assert.match(source,/await completeTodayTask\(/);
});
test('v2.2 PWA contains its new independent module',()=>{
  assert.equal(VERSION,'3.1.0');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(sw,/myhub-shell-v3\.1\.0/);
  assert.ok(sw.includes('./js/today-actions-core.js'));
});

// Small readwrite mock to check transaction semantics, rather than only pure logic.
let value=tasks(task());
let transactions=[];
const fakeDb={
  onversionchange:null,onclose:null,close(){},
  transaction(storeName,mode){
    transactions.push({storeName,mode});
    let draft=clone(value),stopped=false,queue=[],scheduled=false;
    const tx={oncomplete:null,onabort:null,onerror:null,error:null,
      abort(){stopped=true;queueMicrotask(()=>tx.onabort?.());},
      objectStore(name){assert.equal(name,'meta');return {
        get(key){assert.equal(key,'tasksData');return add(()=>({key,value:clone(draft)}));},
        put(record){assert.equal(record.key,'tasksData');return add(()=>{draft=clone(record.value);return record.key;});}
      };}
    };
    function add(fn){const req={onsuccess:null,result:undefined};queue.push({fn,req});if(!scheduled){scheduled=true;queueMicrotask(pump);}return req;}
    function pump(){if(stopped)return;const item=queue.shift();
      if(!item){if(mode==='readwrite')value=clone(draft);stopped=true;tx.oncomplete?.();return;}
      try{item.req.result=item.fn();item.req.onsuccess?.();queueMicrotask(pump);}catch(err){tx.error=err;stopped=true;tx.onerror?.();}}
    return tx;
  }
};
globalThis.indexedDB={open(){const req={result:fakeDb};queueMicrotask(()=>req.onsuccess?.());return req;}};
test('Atomic Today write updates only one task in readwrite transaction',async()=>{
  value=tasks(task('a'),task('b'));
  transactions=[];
  await completeTodayTask('a',stamp);
  assert.deepEqual(transactions,[{storeName:'meta',mode:'readwrite'}]);
  assert.equal((await getMeta('tasksData')).tasks[0].done,true);
  assert.equal(value.tasks[1].done,false);
});
test('Atomic Today write refuses a stale screen with no changes committed',async()=>{
  value=tasks(task('a','2026-11-22',{title:'Edited',updatedAt:newer}));
  const old=clone(value);
  await assert.rejects(completeTodayTask('a',stamp),errorCode('stale'));
  assert.deepEqual(value,old);
});
test('Atomic Today write refuses corrupt storage without clearing it',async()=>{
  value={schema:1,tasks:[{id:'a'}]};const old=clone(value);
  await assert.rejects(completeTodayTask('a',stamp),errorCode('corrupt'));
  assert.deepEqual(value,old);
});
