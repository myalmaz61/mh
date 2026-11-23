import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNotes} from '../js/notes-view-core.js';
import {translate} from '../js/i18n.js';
const a=[
 {id:'1',title:'Мляко',body:'Купи мляко',items:[],pinned:false,favourite:true,updatedAt:'2026-11-01T12:00:00Z'},
 {id:'2',title:'Ябълки',body:'',items:[{text:'Хляб',done:false}],pinned:true,favourite:false,updatedAt:'2026-11-02T12:00:00Z'},
 {id:'3',title:'Банани',body:'Задача',items:[],pinned:false,favourite:true,updatedAt:'2026-11-03T12:00:00Z'},
];
test('Pinned notes stay first; newest/oldest/title ordering is deterministic and non-mutating',()=>{
 const before=structuredClone(a);
 assert.deepEqual(selectNotes(a).map(n=>n.id),['2','3','1']);
 assert.deepEqual(selectNotes(a,{order:'oldest'}).map(n=>n.id),['2','1','3']);
 assert.deepEqual(selectNotes(a,{order:'title'}).map(n=>n.id),['2','3','1']);
 assert.deepEqual(a,before);
});
test('Favourite and pinned filters are composable with Bulgarian search in body and checklist items',()=>{
 assert.deepEqual(selectNotes(a,{scope:'favourites'}).map(n=>n.id),['3','1']);
 assert.deepEqual(selectNotes(a,{scope:'pinned'}).map(n=>n.id),['2']);
 assert.deepEqual(selectNotes(a,{scope:'pinned',query:'хляб'}).map(n=>n.id),['2']);
 assert.deepEqual(selectNotes(a,{scope:'favourites',query:'мляКО'}).map(n=>n.id),['1']);
 assert.deepEqual(selectNotes(a,{scope:'favourites',query:'неприсъства'}),[]);
});
test('Broken data and unsupported options never change the original note array',()=>{
 assert.deepEqual(selectNotes(null),[]);
 assert.deepEqual(selectNotes([null,undefined,{title:12,items:[]}]),[]);
 assert.deepEqual(selectNotes(a,{scope:'missing',order:'?'}).map(n=>n.id),['2','3','1']);
});
test('Compact Notes UI, share and labels are present in both languages',()=>{
 const src=readFileSync(new URL('../js/notes.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 for(const id of ['note-scope','note-order','notes-count','share-note'])assert.ok(src.includes(id),id);
 assert.match(src,/selectNotes\(notes,/);assert.ok(worker.includes('js/notes-view-core.js'));
 for(const lang of ['bg','en'])for(const key of ['notesFilter','notesAll','notesPinned','notesFavourites','notesSort','notesNewest','notesOldest','notesTitleSort','notesCount','notesShare','notesShareCopied'])assert.notEqual(translate(lang)(key),key);
});
