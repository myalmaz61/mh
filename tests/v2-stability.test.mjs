import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DEFAULT_SETTINGS,VERSION} from '../js/config.js';
import {readBackupSnapshot,createBackup,replaceFromBackup,putNote,setMeta,getMeta,getNotes,validateBackup} from '../js/db.js';

// A small transactional IDB simulator: readwrite operations affect a private
// draft and commit only when all queued requests finish. Abort discards draft.
const state={notes:[],meta:new Map()};
const transactions=[];
function databaseMock(){
  return {
    close(){},objectStoreNames:{contains:()=>true},
    transaction(scope,mode){
      const stores=Array.isArray(scope)?scope:[scope];
      transactions.push({scope:stores,mode});
      const data={notes:structuredClone(state.notes),meta:new Map(structuredClone([...state.meta]))};
      let queue=[],stopped=false,started=false;
      const tx={oncomplete:null,onabort:null,onerror:null,error:null,
        abort(){if(stopped)return;stopped=true;setTimeout(()=>tx.onabort?.(),0);},
        objectStore(name){
          if(!stores.includes(name))throw Error('Unknown store');
          return {
            getAll(){return add(()=>name==='notes'?structuredClone(data.notes):[...data.meta.entries()].map(([key,value])=>({key,value:structuredClone(value)})));},
            get(key){return add(()=>{if(name==='notes')return structuredClone(data.notes.find(x=>x.id===key));
              return data.meta.has(key)?{key,value:structuredClone(data.meta.get(key))}:undefined;});},
            put(value){return add(()=>{if(mode!=='readwrite')throw Error('Readonly');if(name==='notes'){
                const idx=data.notes.findIndex(x=>x.id===value.id);if(idx<0)data.notes.push(structuredClone(value));else data.notes[idx]=structuredClone(value);
                data.notes.sort((a,b)=>a.id.localeCompare(b.id));return value.id;
              }data.meta.set(value.key,structuredClone(value.value));return value.key;});},
            delete(key){return add(()=>{if(mode!=='readwrite')throw Error('Readonly');if(name==='notes')data.notes=data.notes.filter(x=>x.id!==key);else data.meta.delete(key);});},
            clear(){return add(()=>{if(mode!=='readwrite')throw Error('Readonly');if(name==='notes')data.notes=[];else data.meta.clear();});}
          };
        }
      };
      function add(fn){const req={result:undefined,onsuccess:null,onerror:null};queue.push({fn,req});
        if(!started){started=true;setTimeout(pump,0);}return req;}
      function pump(){
        if(stopped)return;
        const item=queue.shift();
        if(!item){
          stopped=true;
          if(mode==='readwrite'){
            state.notes=structuredClone(data.notes);state.meta=new Map(structuredClone([...data.meta]));
          }
          tx.oncomplete?.();return;
        }
        try{item.req.result=item.fn();item.req.onsuccess?.();}
        catch(err){tx.error=err;stopped=true;tx.onerror?.();tx.onabort?.();return;}
        setTimeout(pump,0);
      }
      return tx;
    }
  };
}
const db=databaseMock();
globalThis.indexedDB={open(){const req={result:db};queueMicrotask(()=>req.onsuccess?.());return req;}};
function reset(){state.notes=[];state.meta=new Map([['settings',structuredClone(DEFAULT_SETTINGS)],['calcHistory',[]]]);transactions.length=0;}
const mkNote=(id,body='A')=>({id,kind:'text',title:'Note',body,items:[],pinned:false,favourite:false,createdAt:'2026-11-22T12:00:00.000Z',updatedAt:'2026-11-22T12:00:00.000Z'});
// Tests are awaited sequentially because the state and fake IndexedDB are shared.
test('v2 uses same IndexedDB schema and no extra services',()=>{
  assert.equal(VERSION,'2.1.0');
  const src=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
  assert.match(src,/DB_NAME = 'myhub-local'/);
  assert.match(src,/DB_VERSION = 1/);
  assert.match(src,/format:1/);
});
test('one readonly transaction captures notes and settings together',async()=>{
  reset();await putNote(mkNote('n1'));await setMeta('calcHistory',[{expression:'1+1',result:'2',at:'2026-11-22T12:00:00Z'}]);
  transactions.length=0;
  const raw=await readBackupSnapshot();
  assert.deepEqual(raw.notes.map(n=>n.id),['n1']);
  assert.equal(raw.meta.calcHistory[0].result,'2');
  assert.deepEqual(transactions,[{scope:['notes','meta'],mode:'readonly'}]);
});
test('backup export validates full consistent snapshot and does no writes',async()=>{
  reset();await putNote(mkNote('a'));
  transactions.length=0;
  const exported=await createBackup();
  assert.equal(exported.version,'2.1.0');
  assert.equal(validateBackup(exported).notes[0].id,'a');
  assert.deepEqual(transactions,[{scope:['notes','meta'],mode:'readonly'}]);
});
test('restore previews and applies only with unchanged local records',async()=>{
  reset();await putNote(mkNote('old'));
  const expected=await readBackupSnapshot();
  const backup=await createBackup(expected);
  backup.data.notes=[mkNote('new','Restored')];
  await replaceFromBackup(backup,expected);
  assert.deepEqual((await getNotes()).map(n=>n.id),['new']);
  assert.equal((await getMeta('settings')).theme,'auto');
});
test('new note between preview and Restore aborts with no data loss',async()=>{
  reset();await putNote(mkNote('old'));
  const expected=await readBackupSnapshot();
  const backup=await createBackup(expected);
  backup.data.notes=[mkNote('replacement')];
  await putNote(mkNote('added-after-preview'));
  await assert.rejects(replaceFromBackup(backup,expected),e=>e.code==='stale-preview');
  assert.deepEqual((await getNotes()).map(n=>n.id),['added-after-preview','old']);
});
test('changed settings between preview and Restore abort, even with equal record counts',async()=>{
  reset();const expected=await readBackupSnapshot();
  const backup=await createBackup(expected);
  await setMeta('settings',{...DEFAULT_SETTINGS,theme:'dark'});
  await assert.rejects(replaceFromBackup(backup,expected),e=>e.code==='stale-preview');
  assert.equal((await getMeta('settings')).theme,'dark');
});
test('non-backed-up timestamp does not block Restore and is cleared afterwards',async()=>{
  reset();const expected=await readBackupSnapshot();
  const backup=await createBackup(expected);
  await setMeta('lastBackupExportAt','2026-11-22T10:00:00Z');
  await replaceFromBackup(backup,expected);
  assert.equal(await getMeta('lastBackupExportAt'),undefined);
});
test('old unguarded restore API remains compatible',async()=>{
  reset();const backup=await createBackup();
  backup.data.notes=[mkNote('legacy')];
  await replaceFromBackup(backup);
  assert.equal((await getNotes())[0].id,'legacy');
});
test('invalid archive never starts a write transaction',async()=>{
  reset();const guard=await readBackupSnapshot();
  const bad={app:'MyHub',format:1,data:{notes:[{id:'wrong'}],settings:{},calcHistory:[]}};
  transactions.length=0;
  await assert.rejects(replaceFromBackup(bad,guard));
  assert.equal(transactions.filter(x=>x.mode==='readwrite').length,0);
});
test('service worker keeps matching HTML and scripts in one versioned shell',async()=>{
  const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(source,/myhub-shell-v2\.1\.0/);
  const listeners=new Map(),requested=[];
  const scope='https://test.example/myhub/';
  const shell=new Map([[scope+'index.html',{tag:'cached-index-v2'}],[scope+'share.html',{tag:'cached-share-v2'}]]);
  const ctx={URL,Response:{error:()=>({tag:'offline-error'})},console,
    self:{registration:{scope},addEventListener:(n,fn)=>listeners.set(n,fn)},
    caches:{open:async name=>{assert.equal(name,'myhub-shell-v2.1.0');return {match:async url=>shell.get(url)};}},
    fetch:async request=>{requested.push(request.url);return {tag:'network-v3'};}};
  vm.runInNewContext(source,ctx);
  for(const [url,tag] of [[scope,'cached-index-v2'],[scope+'share.html?shareId=local-token','cached-share-v2']]){
    const request={url,method:'GET',mode:'navigate'};
    let promise;
    listeners.get('fetch')({request,respondWith:r=>{promise=r;}});
    assert.equal((await promise).tag,tag);
  }
  assert.deepEqual(requested,[],'navigation must not mix network HTML and old JS');
});
