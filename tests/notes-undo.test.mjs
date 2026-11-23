import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translate } from '../js/i18n.js';

const dbSource=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
const notesSource=readFileSync(new URL('../js/notes.js',import.meta.url),'utf8');

function fakeDatabase(initialNotes=[]) {
  const records=new Map(initialNotes.map(x=>[x.id,structuredClone(x)]));
  const db={
    onclose:null,onversionchange:null,
    transaction(store,mode){
      assert.equal(store,'notes');assert.equal(mode,'readwrite');
      const tx={oncomplete:null,onerror:null,onabort:null,error:null,abort(){queueMicrotask(()=>this.onabort?.());}};
      tx.objectStore=()=>({
        count(){const req={result:records.size,onsuccess:null};queueMicrotask(()=>req.onsuccess?.());return req;},
        add(note){
          queueMicrotask(()=>{
            if(records.has(note.id)) {
              tx.error=new DOMException('Key exists','ConstraintError');tx.onerror?.();
              return;
            }
            records.set(note.id,structuredClone(note));tx.oncomplete?.();
          });
        },
      });
      return tx;
    }
  };
  return {db,records};
}
async function withFakeIndexedDB(initialNotes,act){
  const prior=globalThis.indexedDB;
  const {db,records}=fakeDatabase(initialNotes);
  globalThis.indexedDB={open(){const req={result:db,onsuccess:null,onerror:null,onupgradeneeded:null};queueMicrotask(()=>req.onsuccess?.());return req;}};
  try{const mod=await import('../js/db.js?notes-undo-mock-'+Math.random());return await act(mod,records);}
  finally{globalThis.indexedDB=prior;}
}
const example=(id='n1')=>({id,kind:'text',title:'Testing',body:'Keep this content',items:[],pinned:false,favourite:false,
  createdAt:'2026-11-20T08:00:00Z',updatedAt:'2026-11-22T08:00:00Z'});

test('Undo uses atomic IndexedDB add and never overwrites an occupied note ID', async()=>{
  await withFakeIndexedDB([example('occupied')], async(db,records)=>{
    await assert.rejects(db.restoreDeletedNote(example('occupied')),err=>err.name==='ConstraintError');
    assert.equal(records.get('occupied').body,'Keep this content');
    assert.equal(records.size,1);
  });
  assert.match(dbSource,/store\.add\(snapshot\)/);
});

test('Undo restores the exact note, preserving pinned/favourite/checklist flags and original ID',async()=>{
  const note={...example('deleted'),kind:'checklist',items:[{id:'a',text:'Milk',done:true},{id:'b',text:'Bread',done:false}],pinned:true,favourite:true};
  await withFakeIndexedDB([],async(db,records)=>{
    assert.equal(await db.restoreDeletedNote(note),'deleted');
    assert.deepEqual(records.get('deleted'),note);
  });
});

test('Undo rejects invalid input without writing',async()=>{
  await withFakeIndexedDB([],async(db,records)=>{
    await assert.rejects(db.restoreDeletedNote({...example(),id:null}));
    await assert.rejects(db.restoreDeletedNote({...example(),kind:'unknown'}));
    assert.equal(records.size,0);
  });
});

test('Undo is explicitly temporary and translated; old Notes actions still present',()=>{
  assert.match(notesSource,/let lastDeleted = null/);
  assert.match(notesSource,/lastDeleted=null;/);
  assert.match(notesSource,/id="undo-delete-note"/);
  assert.match(notesSource,/restoreDeletedNote\(candidate\)/);
  assert.match(notesSource,/id="copy-note"/);
  assert.match(notesSource,/id="duplicate-note"/);
  for(const language of ['bg','en'])for(const key of ['notesDeletedUndo','notesUndo','notesUndoSuccess','notesUndoFailed']){
    assert.notEqual(translate(language)(key),key);
  }
});
