import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/config.js';
import { createBackup, validateBackup } from '../js/db.js';
// Minimal in-memory IndexedDB read-only transaction simulator for archive checks.
const values=new Map([['settings',structuredClone(DEFAULT_SETTINGS)],['calcHistory',[]]]);
let notes=[];
let wrote=false;
const database={
  objectStoreNames:{contains:()=>true},
  close:()=>{},
  transaction(storeName,mode){
    if(mode!=='readonly')wrote=true;
    const tx={oncomplete:null,onerror:null,onabort:null};
    let pending=0;
    const completed=()=>{if(--pending===0)setTimeout(()=>tx.oncomplete?.(),0);};
    tx.objectStore=name=>({
      getAll(){
        pending++;
        const result=name==='notes'?structuredClone(notes):[...values].map(([key,value])=>({key,value:structuredClone(value)}));
        setTimeout(completed,0);return {result};
      },
      get(key){
        pending++;
        const result=values.has(key)?{key,value:structuredClone(values.get(key))}:undefined;
        setTimeout(completed,0);return {result};
      }
    });
    return tx;
  }
};
globalThis.indexedDB={open(){const req={result:database};queueMicrotask(()=>req.onsuccess?.());return req;}};
function reset(){values.clear();values.set('settings',structuredClone(DEFAULT_SETTINGS));values.set('calcHistory',[]);notes=[];wrote=false;}
// Run serially; all tests share the same fake database and are deliberately read-only.
test('actual backup creation validates valid data without modifying local records',async()=>{
  reset();const exported=await createBackup();
  assert.equal(exported.version,'2.1.0');
  assert.deepEqual(validateBackup(exported).notes,[]);
  assert.equal(wrote,false);
});
test('actual backup export refuses invalid notes rather than silently omitting them',async()=>{
  reset();notes=[{id:'broken'}];
  await assert.rejects(createBackup(),/invalid note/i);
  assert.equal(notes.length,1);assert.equal(wrote,false);
});
test('actual backup export refuses malformed calculator history',async()=>{
  reset();values.set('calcHistory',[{expression:'1+1',result:2,at:'2026-11-19T12:00:00Z'}]);
  await assert.rejects(createBackup(),/invalid calculation/i);
  assert.equal(wrote,false);
});
test('actual backup export refuses malformed persisted settings before normalising',async()=>{
  reset();values.set('settings',{...DEFAULT_SETTINGS,theme:'broken'});
  await assert.rejects(createBackup(),/invalid preferences/i);
  assert.equal(wrote,false);
});
test('actual backup export refuses damaged weather for selected city',async()=>{
  reset();values.set('weatherCache',{'newport-shropshire-uk':{bad:true}});
  await assert.rejects(createBackup(),/weather cache is damaged/i);
  assert.equal(wrote,false);
});
test('actual backup export refuses malformed timer',async()=>{
  reset();values.set('timerData',{bad:true});
  await assert.rejects(createBackup(),/invalid timer/i);
  assert.equal(wrote,false);
});
