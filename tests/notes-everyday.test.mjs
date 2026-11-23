import test from 'node:test';
import assert from 'node:assert/strict';
import {plainNoteText, duplicateNoteData} from '../js/note-actions-core.js';
import {translate} from '../js/i18n.js';
import {readFileSync} from 'node:fs';
const sample={id:'original',kind:'text',title:'Моят ден',body:'Вземи хляб',items:[],pinned:true,favourite:true};
test('copy exports title and body in readable format',()=>{
  assert.equal(plainNoteText(sample),'Моят ден\n\nВземи хляб');
  assert.equal(plainNoteText({...sample,title:''}),'Вземи хляб');
});
test('checklist copy shows checked and unchecked rows, safely as plain text',()=>{
  assert.equal(plainNoteText({...sample,kind:'checklist',items:[{text:'Хляб',done:false},{text:'Мляко',done:true}]}),'Моят ден\n[ ] Хляб\n[x] Мляко');
  assert.throws(()=>plainNoteText({...sample,kind:'checklist',items:[{text:'X'}]}));
});
test('duplicate is independent, has fresh IDs, preserves content but not pins',()=>{
  let i=0;
  const c=duplicateNoteData({...sample,kind:'checklist',items:[{id:'old1',text:'X',done:false}]},'new',()=>`newrow${++i}`,'2026-11-23T08:00:00.000Z');
  assert.equal(c.title,'Моят ден (копие)');assert.equal(c.id,'new');assert.equal(c.items[0].id,'newrow1');
  assert.equal(c.items[0].text,'X');assert.equal(c.pinned,false);assert.equal(c.favourite,false);
  assert.equal(c.createdAt,'2026-11-23T08:00:00.000Z');
  c.items[0].text='Changed';assert.equal(sample.id,'original');
});
test('duplicate title length is limited; broken original is rejected',()=>{
  const c=duplicateNoteData({...sample,title:'A'.repeat(200)},'new',()=>'', '2026-11-23T08:00:00.000Z');
  assert.equal(c.title.length,200);
  assert.throws(()=>duplicateNoteData({...sample,items:[{text:42,done:false}]},'new',()=>'', '2026-11-23T08:00:00.000Z'));
});
test('both note actions rendered, translated and precached',()=>{
  const src=readFileSync(new URL('../js/notes.js',import.meta.url),'utf8');
  assert.ok(src.includes("#duplicate-note")&&src.includes('id="copy-note"'));
  for(const lang of ['bg','en'])for(const key of ['notesDuplicate','notesDuplicated','notesCopySuffix'])assert.notEqual(translate(lang)(key),key);
  assert.ok(readFileSync(new URL('../sw.js',import.meta.url),'utf8').includes('js/note-actions-core.js'));
});
