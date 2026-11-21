import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildQuickTask,buildQuickNote} from '../js/quick-add-core.js';
import {validTask, validTasksData, emptyTasks, MAX_TASKS} from '../js/tasks-core.js';
import {validateBackup} from '../js/db.js';
import {translate} from '../js/i18n.js';
import {VERSION} from '../js/config.js';
const file = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const timestamp='2026-11-21T11:45:00.000Z';
const spec={id:'example-quick',now:timestamp};
test('Quick Add uses existing Tasks schema, preserves due date and high priority',()=>{
  const task=buildQuickTask({title:'  Buy milk  ',details:'  for cafe  ',due:'2026-11-22',high:true},spec);
  assert.deepEqual(task,{id:'example-quick',title:'Buy milk',details:'for cafe',due:'2026-11-22',priority:'high',done:false,createdAt:timestamp,updatedAt:timestamp});
  assert.equal(validTask(task),true);
  assert.equal(validTasksData({schema:1,tasks:[task]}),true);
});
test('Quick Add rejects bad task titles, date and oversized details',()=>{
  for(const input of [{title:' '},{title:'X'.repeat(141)},{title:'Hello',due:'2026-02-30'},{title:'Hi',details:'X'.repeat(2001)}]){
    assert.throws(()=>buildQuickTask(input,spec));
  }
  assert.equal(buildQuickTask({title:'No date'},spec).due,'');
});
test('Quick Add note is full Notes v1 model with non-empty title',()=>{
  const note=buildQuickNote({title:'  My idea  ',body:'  Something useful  '},spec);
  assert.deepEqual(note,{id:'example-quick',kind:'text',title:'My idea',body:'Something useful',items:[],pinned:false,favourite:false,createdAt:timestamp,updatedAt:timestamp});
  assert.throws(()=>buildQuickNote({title:' '},spec));
  assert.throws(()=>buildQuickNote({title:'x'.repeat(201)},spec));
  assert.throws(()=>buildQuickNote({title:'x',body:'y'.repeat(100001)},spec));
});
test('Quick Add does not change IndexedDB schema or JSON backup format',()=>{
  const db=file('js/db.js');
  assert.match(db,/const DB_VERSION = 1;/);
  assert.match(db,/appendQuickTask/);
  assert.match(db,/db\.transaction\('meta','readwrite'\)/);
  assert.match(db,/!validTasksData\(existing\)/);
  assert.match(db,/existing\.tasks\.length>=MAX_TASKS/);
  assert.match(db,/tx\.abort\(\)/);
  assert.match(db,/\{schema:1,tasks:\[\.\.\.existing\.tasks/);
  assert.doesNotMatch(db,/quickAddData|quickAddStore/);
});
test('Quick Add UI is linked to Home and Tools only',()=>{
  const app=file('js/app.js'),mod=file('js/quick-add.js');
  assert.equal(VERSION,'1.2.0');
  assert.match(app,/mountQuickAdd/);
  assert.match(app,/quickAdd\?\.setVisible\(route\)/);
  assert.match(mod,/\['home','tools'\]\.includes\(route\)/);
  assert.match(mod,/dialog\.showModal\(\)/);
  assert.match(mod,/openRecord\(route,\{id:record\.id\}\)/);
  assert.match(mod,/saving=true/);
  assert.match(mod,/quickAddDiscard/);
});
test('Translations and offline assets are complete',()=>{
  const html=file('index.html'),sw=file('sw.js');
  for(const asset of ['quick-add.css','js/quick-add.js','js/quick-add-core.js'])assert.ok(sw.includes(asset),asset);
  assert.ok(sw.includes('myhub-shell-v1.2.0'));
  assert.match(html,/quick-add\.css/);
  const mod=file('js/quick-add.js');
  const keys=new Set(Array.from(mod.matchAll(/t\('([A-Za-z0-9]+)'\)/g),x=>x[1]));
  for(const key of keys){
    assert.notEqual(translate('bg')(key),key,'Bulgarian: '+key);
    assert.notEqual(translate('en')(key),key,'English: '+key);
  }
});
test('Quick task sample can be included in existing valid backup',()=>{
  const task=buildQuickTask({title:'Open shop'},spec);
  const backup={app:'MyHub',format:1,createdAt:timestamp,data:{
    notes:[],settings:{theme:'auto',language:'bg',favourites:['calculator'],timeZones:['Europe/London']},calcHistory:[],
    tasksData:{schema:1,tasks:[task]}
  }};
  assert.equal(validateBackup(backup).tasksData.tasks[0].title,'Open shop');
});
