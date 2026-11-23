import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_TRASH_NOTES, emptyNotesTrash, validNotesTrash } from '../js/notes-trash-core.js';
import { validateBackup, createBackup, getNotes, getNotesTrash, moveNoteToTrash,
  restoreTrashedNote, purgeTrashedNote, emptyNotesTrashForever, replaceFromBackup } from '../js/db.js';
import { DEFAULT_SETTINGS, VERSION } from '../js/config.js';
import { compareBackupContents, previewBackup } from '../js/backup-preview-core.js';
import { translate } from '../js/i18n.js';

const sample=(id='n1')=>({id,kind:'checklist',title:'Покупки',body:'',items:[{id:id+'-a',text:'Мляко',done:true},{id:id+'-b',text:'Хляб',done:false}],pinned:true,favourite:true,
  createdAt:'2026-11-20T09:00:00.000Z',updatedAt:'2026-11-22T09:00:00.000Z'});
const makeBackup=(notes=[],trash=undefined)=>({app:'MyHub',format:1,version:VERSION,data:{notes,settings:structuredClone(DEFAULT_SETTINGS),calcHistory:[],...(trash?{notesTrashData:trash}:{})}});

/** Minimal transactional fake IndexedDB with rollback. All writes commit together.
 * Exercise the real DB functions with callback ordering, transaction aborts, and
 * unique ID constraints; no external test package needed. */
class FakeIDB {
  constructor(){this.notes=new Map();this.meta=new Map();this.onclose=null;this.onversionchange=null;}
  transaction(names,mode){
    const tx=this;
    const namesList=Array.isArray(names)?names:[names];
    const staged={notes:new Map(this.notes),meta:new Map(this.meta)};
    let pending=0,done=false,aborted=false;
    const record={oncomplete:null,onerror:null,onabort:null,error:null,abort(){
      if(!aborted&&!done){aborted=true;queueMicrotask(()=>record.onabort?.());}
    }};
    const finalize=()=>{if(done||aborted||pending!==0)return;
      done=true;
      if(mode==='readwrite'){for(const name of namesList)tx[name]=staged[name];}
      record.oncomplete?.();
    };
    const clone=v=>v===undefined?undefined:structuredClone(v);
    record.objectStore=name=>{
      if(!namesList.includes(name))throw Error('store unavailable');
      const map=staged[name];
      const enqueue=fn=>{
        pending++;const r={result:undefined,onsuccess:null,onerror:null};
        queueMicrotask(()=>{
          if(aborted){pending--;return;}
          try{r.result=clone(fn());}
          catch(err){record.error=err;aborted=true;record.onerror?.();record.onabort?.();pending--;return;}
          r.onsuccess?.();pending--;
          queueMicrotask(finalize);
        });
        return r;
      };
      return {
        get:key=>enqueue(()=>name==='notes'?map.get(key):(map.has(key)?{key,value:map.get(key)}:undefined)),
        getAll:()=>enqueue(()=>name==='notes'?[...map.values()]:[...map].map(([key,value])=>({key,value}))),
        count:()=>enqueue(()=>map.size),
        put:value=>enqueue(()=>{
          if(mode!=='readwrite')throw Error('read-only');
          const key=name==='notes'?value.id:value.key;
          map.set(key,clone(name==='notes'?value:value.value));
          return key;
        }),
        add:value=>enqueue(()=>{
          if(mode!=='readwrite')throw Error('read-only');
          const key=name==='notes'?value.id:value.key;
          if(map.has(key))throw new DOMException('Duplicate key','ConstraintError');
          map.set(key,clone(name==='notes'?value:value.value));return key;
        }),
        delete:key=>enqueue(()=>{if(mode!=='readwrite')throw Error('read-only');map.delete(key);}),
        clear:()=>enqueue(()=>{if(mode!=='readwrite')throw Error('read-only');map.clear();}),
      };
    };
    return record;
  }
}
const fake=new FakeIDB();
globalThis.indexedDB={open(){const req={result:fake,onsuccess:null,onerror:null,onblocked:null};queueMicrotask(()=>req.onsuccess?.());return req;}};
function reset(notes=[]){fake.notes=new Map(notes.map(n=>[n.id,structuredClone(n)]));fake.meta=new Map([['settings',structuredClone(DEFAULT_SETTINGS)],['calcHistory',[]]]);}

// Tests that exercise this shared fake run serially within this test file.
test('v3.0 note trash validates the full original record, timestamps and unique IDs',()=>{
  const basic={schema:1,items:[{note:sample('one'),deletedAt:'2026-11-23T19:22:00Z'}]};
  assert.equal(validNotesTrash(basic),true);
  assert.equal(validNotesTrash(basic,['one']),false);
  assert.equal(validNotesTrash({...basic,items:[basic.items[0],basic.items[0]]}),false);
  assert.equal(validNotesTrash({...basic,items:[{...basic.items[0],note:{...sample('one'),items:[{id:'x',text:20,done:false}]}}]}),false);
  assert.equal(validNotesTrash({...basic,items:[{...basic.items[0],deletedAt:'nonsense'}]}),false);
  assert.equal(validNotesTrash({schema:1,items:Array(MAX_TRASH_NOTES+1).fill(basic.items[0])}),false);
  assert.deepEqual(emptyNotesTrash(),{schema:1,items:[]});
});
test('older MyHub backup restores with EMPTY trash; new backup retains all deleted content',()=>{
  const legacy=validateBackup(makeBackup([sample()]));
  assert.deepEqual(legacy.notesTrashData,emptyNotesTrash());
  const trash={schema:1,items:[{note:sample('deleted'),deletedAt:'2026-11-23T19:22:00Z'}]};
  assert.deepEqual(validateBackup(makeBackup([sample('live')],trash)).notesTrashData,trash);
  assert.throws(()=>validateBackup(makeBackup([sample('deleted')],trash)),/invalid notes trash/i);
  assert.throws(()=>validateBackup(makeBackup([],{schema:1,items:[{note:sample('n'),deletedAt:'bad'}]})),/invalid notes trash/i);
});
test('moving to trash is durable, atomic, exact and undo restores checklist/favourites',async()=>{
  const note=sample('buy');reset([note]);
  await moveNoteToTrash(note);
  assert.deepEqual(await getNotes(),[]);
  let trash=await getNotesTrash();
  assert.equal(trash.items.length,1);
  assert.deepEqual(trash.items[0].note,note);
  const backup=await createBackup();
  assert.deepEqual(backup.data.notesTrashData,trash);
  assert.equal(previewBackup(backup,validateBackup(backup)).counts.trashedNotes,1);
  const restored=await restoreTrashedNote('buy');
  assert.deepEqual(restored,note);
  assert.deepEqual(await getNotes(),[note]);
  assert.deepEqual(await getNotesTrash(),emptyNotesTrash());
});
test('stale editor delete aborts with NO writes to Notes or Trash',async()=>{
  const note=sample('n1');reset([{...note,title:'New text from another tab'}]);
  await assert.rejects(moveNoteToTrash(note),e=>e.code==='stale-note');
  assert.equal((await getNotes())[0].title,'New text from another tab');
  assert.deepEqual(await getNotesTrash(),emptyNotesTrash());
});
test('trash full refuses deletion; does not silently evict older notes',async()=>{
  const note=sample('new');reset([note]);
  fake.meta.set('notesTrashData',{schema:1,items:Array.from({length:MAX_TRASH_NOTES},(_,i)=>({note:sample('old'+i),deletedAt:'2026-11-23T19:00:00Z'}))});
  await assert.rejects(moveNoteToTrash(note),e=>e.code==='trash-full');
  assert.equal((await getNotes()).length,1);
  assert.equal((await getNotesTrash()).items.length,MAX_TRASH_NOTES);
});
test('restore does not overwrite an existing note with same ID; trash is preserved',async()=>{
  const note=sample('same');reset([{...note,body:'Newer, live content'}]);
  fake.meta.set('notesTrashData',{schema:1,items:[{note,deletedAt:'2026-11-23T19:00:00Z'}]});
  await assert.rejects(restoreTrashedNote('same'),e=>e.code==='duplicate');
  assert.equal((await getNotes())[0].body,'Newer, live content');
  assert.equal((await getNotesTrash()).items.length,1);
});
test('permanent deletion is limited to selected trash ID; empty trash leaves active notes alone',async()=>{
  const live=sample('live');reset([live]);
  fake.meta.set('notesTrashData',{schema:1,items:['a','b'].map(id=>({note:sample(id),deletedAt:'2026-11-23T19:00:00Z'}))});
  await purgeTrashedNote('a');
  assert.deepEqual((await getNotesTrash()).items.map(x=>x.note.id),['b']);
  await assert.rejects(purgeTrashedNote('missing'));
  assert.deepEqual((await getNotesTrash()).items.map(x=>x.note.id),['b']);
  await emptyNotesTrashForever();
  assert.deepEqual(await getNotesTrash(),emptyNotesTrash());
  assert.deepEqual(await getNotes(),[live]);
});
test('corrupt trash blocks deletion, purge and backup WITHOUT modifying active notes',async()=>{
  const live=sample('live');reset([live]);fake.meta.set('notesTrashData',{schema:1,items:[{note:sample('bad'),deletedAt:'broken'}]});
  await assert.rejects(getNotesTrash());
  await assert.rejects(moveNoteToTrash(live));
  await assert.rejects(emptyNotesTrashForever());
  await assert.rejects(createBackup(),/trash/i);
  assert.deepEqual(await getNotes(),[live]);
});
test('legacy Restore removes current trash only after explicit restore commit',async()=>{
  reset();fake.meta.set('notesTrashData',{schema:1,items:[{note:sample('deleted'),deletedAt:'2026-11-23T19:00:00Z'}]});
  const guard={notes:[],meta:{settings:structuredClone(DEFAULT_SETTINGS),calcHistory:[],notesTrashData:await getNotesTrash()}};
  await replaceFromBackup(makeBackup([sample('restored')]),guard);
  assert.deepEqual(await getNotesTrash(),emptyNotesTrash());
  assert.deepEqual((await getNotes()).map(x=>x.id),['restored']);
});
test('backup Restore diff reports trash records missing or changed',()=>{
  const now=validateBackup(makeBackup([],{schema:1,items:[{note:sample('old'),deletedAt:'2026-11-23T19:00:00Z'}]}));
  const incoming=validateBackup(makeBackup());
  const changed=compareBackupContents(now,incoming).find(x=>x.key==='trashedNotes');
  assert.deepEqual(changed,{key:'trashedNotes',current:1,incoming:0,removed:1,added:0,changed:0});
});
test('Notes persistent trash UI is translated and pre-cached',()=>{
  const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const notes=readFileSync(new URL('../js/notes.js',import.meta.url),'utf8');
  assert.match(worker,/js\/notes-trash-core\.js/);
  assert.match(notes,/moveNoteToTrash/);
  assert.match(notes,/restoreTrashedNote/);
  assert.match(notes,/emptyNotesTrashForever/);
  for(const lang of ['bg','en'])for(const key of ['trashTitle','trashEmpty','trashRestore','trashPurge','trashEmptyAll','trashCorrupt']){
    assert.notEqual(translate(lang)(key),key,lang+' '+key);
  }
});
test('v3.1 category survives atomic trash → restore, including backup',async()=>{
  const note={...sample('classified'),category:'Работа'};
  reset([note]);
  await moveNoteToTrash(note);
  const trash=await getNotesTrash();
  assert.equal(trash.items[0].note.category,'Работа');
  const backup=await createBackup();
  assert.equal(backup.data.notesTrashData.items[0].note.category,'Работа');
  await restoreTrashedNote('classified');
  assert.deepEqual(await getNotes(),[note]);
});
