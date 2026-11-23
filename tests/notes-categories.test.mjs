import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validNoteCategory,categoryName,noteCategories} from '../js/notes-category-core.js';
import {validStoredNote,validNotesTrash} from '../js/notes-trash-core.js';
import {selectNotes} from '../js/notes-view-core.js';
import {duplicateNoteData} from '../js/note-actions-core.js';
import {makeNote} from '../js/utils.js';
import {validateBackup} from '../js/db.js';
import {DEFAULT_SETTINGS} from '../js/config.js';
import {translate} from '../js/i18n.js';
const moment='2026-11-20T10:00:00.000Z';
const sample=(id,category)=>({id,kind:'text',title:`Бележка ${id}`,body:'Мляко',items:[],pinned:false,favourite:false,createdAt:moment,updatedAt:moment,...(category!==undefined?{category}:{})});
const backup=notes=>({app:'MyHub',format:1,data:{notes,settings:structuredClone(DEFAULT_SETTINGS),calcHistory:[]}});
test('old uncategorised notes continue valid with no migration, new notes default to empty category',()=>{
 assert.equal(validStoredNote(sample('old')),true);
 assert.equal(validateBackup(backup([sample('old')])).notes[0].category,undefined);
 assert.equal(makeNote('text').category,'');
});
test('category supports Cyrillic and UK labels, rejects oversized, control and non-string fields',()=>{
 for(const value of [undefined,'','Лични','Работа','Shopping','X'.repeat(40)])assert.equal(validNoteCategory(value),true);
 for(const value of [null,42,{},'x'.repeat(41),'x\ny','a\u0000'])assert.equal(validNoteCategory(value),false);
 assert.equal(categoryName('  My  notes  '),'My notes');
 for(const category of [null,'a'.repeat(41),'work\nother']){
  assert.equal(validStoredNote(sample('bad',category)),false);
  assert.throws(()=>validateBackup(backup([sample('bad',category)])));
 }
});
test('filter categories, empty, case insensitive and Bulgarian search without mutating input',()=>{
 const all=[sample('one','Лични'),sample('two','Работа'),sample('three'),sample('four','лични')];
 const original=structuredClone(all);
 assert.deepEqual(noteCategories(all),['Лични','Работа']);
 assert.deepEqual(selectNotes(all,{category:'ЛИЧНИ'}).map(n=>n.id),['four','one']);
 assert.deepEqual(selectNotes(all,{category:''}).map(n=>n.id),['three']);
 assert.deepEqual(selectNotes(all,{query:'работа'}).map(n=>n.id),['two']);
 assert.deepEqual(all,original);
});
test('duplicate keeps optional category and trash/backup retain category',()=>{
 const original=sample('n1','Кафене');
 const copy=duplicateNoteData(original,'n2',()=>'',moment);
 assert.equal(copy.category,'Кафене');
 assert.equal(validStoredNote(copy),true);
 const trash={schema:1,items:[{note:original,deletedAt:moment}]};
 assert.equal(validNotesTrash(trash),true);
 assert.deepEqual(validateBackup({...backup([copy]),data:{...backup([copy]).data,notesTrashData:trash}}).notesTrashData,trash);
 assert.equal(validNotesTrash({schema:1,items:[{note:sample('x','x'.repeat(50)),deletedAt:moment}]}),false);
});
test('UI includes category editor, filter, labels in both languages and offline source',()=>{
 const notes=readFileSync(new URL('../js/notes.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 for(const id of ['note-category','note-category-filter','note-category-suggestions'])assert.ok(notes.includes(id),id);
 assert.ok(sw.includes('js/notes-category-core.js'));
 for(const lang of ['bg','en'])for(const key of ['notesCategory','notesOptional','notesCategoryPlaceholder','notesAllCategories','notesNoCategory']){
  assert.notEqual(translate(lang)(key),key,`${lang} ${key}`);
 }
});
test('global search can find notes by category without changing original note',async()=>{
 const {makeSearchIndex,findInIndex}=await import('../js/search-core.js');
 const source=sample('n','Работа');
 const index=makeSearchIndex({notes:[source]});
 assert.deepEqual(findInIndex(index,'работа').results.map(r=>r.id),['n']);
 assert.equal(source.category,'Работа');
});
