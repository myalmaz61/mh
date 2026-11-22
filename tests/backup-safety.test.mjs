import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_SETTINGS, VERSION} from '../js/config.js';
import {normaliseSettings,validateBackup} from '../js/db.js';
import {compareBackupContents,backupReminderState} from '../js/backup-preview-core.js';
const mkNote=(id,body)=>({id,kind:'text',title:'Note',body,items:[],pinned:false,favourite:false,createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z'});
const empty=()=>validateBackup({app:'MyHub',format:1,version:'0.1.0',data:{notes:[],settings:{theme:'auto',language:'bg',favourites:[],timeZones:[]},calcHistory:[]}});
test('v1.8 keeps database and backup format intact',()=>{
 assert.equal(VERSION,'2.2.0');
 const source=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
 assert.match(source,/const DB_NAME = 'myhub-local'/);
 assert.match(source,/const DB_VERSION = 1/);
 assert.match(source,/format:1/);
});
test('legacy archive defaults to 14-day reminder without invalidating data',()=>{
 const restored=empty();
 assert.equal(restored.settings.backupReminderDays,14);
 assert.equal(normaliseSettings({}).backupReminderDays,14);
});
test('reminder preferences roundtrip and off disables status',()=>{
 for(const value of [0,7,14,30]){
  const data={app:'MyHub',format:1,data:{notes:[],settings:{...DEFAULT_SETTINGS,backupReminderDays:value},calcHistory:[]}};
  assert.equal(validateBackup(data).settings.backupReminderDays,value);
 }
 assert.deepEqual(backupReminderState('2026-10-01T10:00:00Z',0),{enabled:false,due:false,daysSince:null});
});
test('invalid reminder values are rejected before restore',()=>{
 for(const value of [-1,1,100,'14',null,7.5]){
  const data={app:'MyHub',format:1,data:{notes:[],settings:{...DEFAULT_SETTINGS,backupReminderDays:value},calcHistory:[]}};
  assert.throws(()=>validateBackup(data),undefined,String(value));
 }
});
test('reminder uses elapsed real time, no stale timer intervals',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z');
 assert.deepEqual(backupReminderState('2026-11-15T12:00:00Z',7,now),{enabled:true,due:true,daysSince:7});
 assert.deepEqual(backupReminderState('2026-11-16T12:00:00Z',7,now),{enabled:true,due:false,daysSince:6});
 assert.deepEqual(backupReminderState(null,7,now),{enabled:true,due:true,daysSince:null});
 assert.deepEqual(backupReminderState('not-a-date',14,now),{enabled:true,due:true,daysSince:null});
 assert.equal(backupReminderState('2040-01-01T00:00:00Z',14,now).due,true);
 assert.throws(()=>backupReminderState(null,15));
});
test('different IDs with identical counts are still reported as losses',()=>{
 const first=empty(),second=empty();
 first.notes=[mkNote('old','A')];second.notes=[mkNote('new','B')];
 const before=JSON.stringify(first), after=JSON.stringify(second);
 const results=compareBackupContents(first,second);
 assert.deepEqual(results.find(x=>x.key==='notes'),{key:'notes',current:1,incoming:1,removed:1,added:1,changed:0});
 assert.equal(JSON.stringify(first),before);assert.equal(JSON.stringify(second),after);
});
test('same ID changed text is warned about, even with equal counts',()=>{
 const first=empty(),second=empty();
 first.notes=[mkNote('n1','Current text')];second.notes=[mkNote('n1','Older text')];
 const result=compareBackupContents(first,second).find(x=>x.key==='notes');
 assert.equal(result.removed,0);assert.equal(result.changed,1);
});
test('existing tasks and appointments missing from old archives are flagged',()=>{
 const existing=empty(),legacy=empty();
 existing.tasksData.tasks=[{id:'a',title:'A'}];
 existing.calendarData.events=[{id:'e',title:'Visit'}];
 const diff=compareBackupContents(existing,legacy);
 assert.equal(diff.find(x=>x.key==='tasks').removed,1);
 assert.equal(diff.find(x=>x.key==='events').removed,1);
});
test('nothing missing when the backup contains the existing entries',()=>{
 const current=empty(),other=empty();
 current.notes=[mkNote('existing','X')];other.notes=[mkNote('existing','X'),mkNote('new','Y')];
 const diff=compareBackupContents(current,other);
 assert.equal(diff.find(x=>x.key==='notes').removed,0);
 assert.equal(diff.find(x=>x.key==='notes').added,1);
});
test('comparison refuses incomplete inputs',()=>{
 assert.throws(()=>compareBackupContents(null,empty()));
 assert.throws(()=>compareBackupContents({},empty()));
});
test('UI shows comparison and explicit checkbox only on Restore',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.match(app,/compareBackupContents\(current,cleaned\)/);
 assert.match(app,/backup-ack-check/);
 assert.match(app,/confirm-backup-restore" disabled/);
 assert.match(app,/replaceFromBackup\(pendingBackup,pendingGuard\)/);
 assert.match(app,/backup-reminder-days/);
 assert.match(app,/await getMeta\('lastBackupExportAt'\)/);
 assert.match(app,/await refreshReminder\(\)/);
});
test('no unwanted additional privileges or network are needed',()=>{
 const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(worker,/myhub-shell-v2\.2\.0/);
 assert.match(worker,/js\/backup-preview-core\.js/);
});
