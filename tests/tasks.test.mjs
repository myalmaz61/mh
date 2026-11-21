import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {validTask,validTasksData,emptyTasks,filteredTasks,taskCounts,MAX_TASKS} from '../js/tasks-core.js';
import {validQuickListsData,emptyQuickLists,quickProgress} from '../js/quick-list-core.js';
import {validateBackup} from '../js/db.js';
import {VERSION,TOOLS} from '../js/config.js';
import {translate} from '../js/i18n.js';
const stamp='2026-11-20T08:00:00.000Z';
const task=(extra={})=>({id:'task-1',title:'Buy groceries',details:'Milk and bread',due:'2026-11-20',priority:'normal',done:false,createdAt:stamp,updatedAt:stamp,...extra});
const list=(extra={})=>({id:'list-1',name:'Shopping',items:[{id:'i-1',text:'Milk',done:false},{id:'i-2',text:'Bread',done:true}],createdAt:stamp,updatedAt:stamp,...extra});
const oldBackup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['notes'],timeZones:['Europe/London']},calcHistory:[]}});
test('new collections start empty and validate',()=>{
  assert.deepEqual(emptyTasks(),{schema:1,tasks:[]});
  assert.deepEqual(emptyQuickLists(),{schema:1,lists:[]});
  assert.ok(validTasksData(emptyTasks()));
  assert.ok(validQuickListsData(emptyQuickLists()));
});
test('task model supports real dates, priority and completed status',()=>{
  assert.ok(validTask(task()));
  assert.ok(validTask(task({due:'',priority:'high',done:true})));
  assert.equal(validTask(task({due:'2026-02-30'})),false);
  assert.equal(validTask(task({due:'2028-02-29'})),true);
});
test('unsafe and damaged tasks are rejected, duplicates never accepted',()=>{
  for(const extra of [{title:''},{title:'x'.repeat(141)},{details:'x'.repeat(2001)},
    {priority:'urgent'},{done:'false'},{createdAt:'wrong'},{id:'<script>'},{due:123}]){
    assert.equal(validTask(task(extra)),false,JSON.stringify(extra).slice(0,60));
  }
  assert.equal(validTasksData({schema:1,tasks:[task(),task()]}),false);
  assert.equal(validTasksData({schema:2,tasks:[]}),false);
  assert.equal(validTasksData({schema:1,tasks:Array.from({length:MAX_TASKS+1},(_,i)=>task({id:'task-'+i}))}),false);
});
test('due and overdue counts use UK local dates without shifting by time zone',()=>{
  const value=[task({id:'a',due:'2026-11-19'}),task({id:'b',due:'2026-11-20'}),task({id:'c',due:'2026-11-21'}),
    task({id:'d',due:''}),task({id:'e',done:true,due:'2026-11-18'})];
  assert.deepEqual(taskCounts(value,'2026-11-20'),{total:5,open:4,done:1,today:2,overdue:1});
  assert.deepEqual(filteredTasks(value,{filter:'today',today:'2026-11-20'}).map(x=>x.id),['a','b']);
});
test('filter search handles title, details, completion and priority',()=>{
  const items=[task({id:'normal',title:'Normal',details:'',due:''}),task({id:'high',title:'Urgent',details:'',priority:'high',due:''}),
    task({id:'done',title:'Finished',details:'',done:true,due:''}),task({id:'milk',title:'Shopping',details:'milk',due:'2026-11-22'})];
  assert.deepEqual(filteredTasks(items,{filter:'all'}).map(x=>x.id),['milk','high','normal','done']);
  assert.deepEqual(filteredTasks(items,{filter:'open',search:'Milk'}).map(x=>x.id),['milk']);
  assert.deepEqual(filteredTasks(items,{filter:'done'}).map(x=>x.id),['done']);
});
test('quick lists are bounded, unique and count progress',()=>{
  assert.equal(validQuickListsData({schema:1,lists:[list()]}),true);
  assert.deepEqual(quickProgress(list()),{total:2,done:1,remaining:1});
  assert.equal(validQuickListsData({schema:1,lists:[list(),list()]}),false);
  assert.equal(validQuickListsData({schema:1,lists:[list({items:[{id:'x',text:'A',done:false},{id:'x',text:'B',done:true}]})]}),false);
  assert.equal(validQuickListsData({schema:1,lists:[list({name:''})]}),false);
  assert.equal(validQuickListsData({schema:1,lists:[list({items:[{id:'x',text:'<img>',done:false}]})]}),true); // encoded at render
  assert.equal(validQuickListsData({schema:1,lists:[list({items:[{id:'x',text:'',done:false}]})]}),false);
  assert.equal(validQuickListsData({schema:1,lists:[list({items:Array.from({length:101},(_,i)=>({id:'i-'+i,text:'a',done:false}))})]}),false);
});
test('legacy v0.1–v0.4 backups restore with empty new modules',()=>{
  const backup=oldBackup();
  assert.deepEqual(validateBackup(backup).tasksData,emptyTasks());
  assert.deepEqual(validateBackup(backup).quickListsData,emptyQuickLists());
  backup.data.calendarData={schema:1,events:[]};
  assert.deepEqual(validateBackup(backup).tasksData,emptyTasks());
});
test('v0.5 backup restores complete tasks and checklists',()=>{
  const backup=oldBackup();backup.data.tasksData={schema:1,tasks:[task()]};backup.data.quickListsData={schema:1,lists:[list()]};
  const result=validateBackup(backup);
  assert.equal(result.tasksData.tasks[0].title,'Buy groceries');
  assert.equal(result.quickListsData.lists[0].items.length,2);
});
test('invalid archived tasks and checklists abort validation before replacing data',()=>{
  const backup=oldBackup();backup.data.tasksData={schema:1,tasks:[task({priority:'root'})]};
  assert.throws(()=>validateBackup(backup),/tasks|задачи/i);
  delete backup.data.tasksData;
  backup.data.quickListsData={schema:1,lists:[list({id:'invalid/id'})]};
  assert.throws(()=>validateBackup(backup),/quick lists|списъци/i);
});
test('tools are searchable and new modules are in service worker',()=>{
  assert.equal(VERSION,'1.5.0');
  assert.ok(TOOLS.some(x=>x.id==='tasks'));
  assert.ok(TOOLS.some(x=>x.id==='quicklist'));
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  for(const asset of ['tasks.css','js/tasks.js','js/tasks-core.js','js/quick-list.js','js/quick-list-core.js'])assert.ok(sw.includes(asset),asset);
  assert.ok(sw.includes('myhub-shell-v1.5.0'));
  assert.ok(html.includes('tasks.css'));
  assert.ok(app.includes("route==='tasks'"));assert.ok(app.includes("route==='quicklist'"));
});
test('UI strings exist in Bulgarian and English for new modules',()=>{
  for(const name of ['tasks.js','quick-list.js']){
    const mod=readFileSync(new URL(`../js/${name}`,import.meta.url),'utf8');
    for(const [,key] of mod.matchAll(/\bt\('([A-Za-z0-9]+)'\)/g)){
      assert.notEqual(translate('bg')(key),key,`missing bg ${key}`);
      assert.notEqual(translate('en')(key),key,`missing en ${key}`);
    }
  }
  for(const key of ['tasks','tasksDesc','quickList','quickListDesc',...['Open','Today','All','Done'].map(s=>'taskFilter'+s)]){
    assert.notEqual(translate('bg')(key),key,`missing bg ${key}`);
    assert.notEqual(translate('en')(key),key,`missing en ${key}`);
  }
});
