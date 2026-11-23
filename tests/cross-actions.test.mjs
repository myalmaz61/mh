import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import { draftEventFromTask, draftTaskFromEvent, draftTaskFromNote } from '../js/cross-actions-core.js';
import { buildQuickCalendarEvent, buildQuickTask } from '../js/quick-add-core.js';
import { validCalendarEvent } from '../js/calendar-core.js';
import { validTask } from '../js/tasks-core.js';
import { translate } from '../js/i18n.js';
import { VERSION } from '../js/config.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const options={id:'draft-check',now:'2026-11-22T12:00:00.000Z'};

test('task → event uses task due date and does not copy its identifier',()=>{
  const input={id:'old-task',title:'Call supplier',details:'Confirm delivery',due:'2026-12-07',priority:'high'};
  const draft=draftEventFromTask(input,'2026-11-22');
  assert.deepEqual(draft,{kind:'calendar',title:'Call supplier',details:'Confirm delivery',date:'2026-12-07',time:'',repeat:'none',truncated:false});
  assert.equal(validCalendarEvent(buildQuickCalendarEvent(draft,options)),true);
  assert.notEqual(buildQuickCalendarEvent(draft,options).id,input.id);
});
test('undated task → event defaults to provided local date',()=>{
  assert.equal(draftEventFromTask({title:'Call mum',due:''},'2026-11-22').date,'2026-11-22');
});
test('invalid due date does not enter new calendar event',()=>{
  assert.equal(draftEventFromTask({title:'Test',due:'2026-02-30'},'2026-11-22').date,'2026-11-22');
});
test('long task title is shortened with a visible warning',()=>{
  const draft=draftEventFromTask({title:'X'.repeat(140)},'2026-11-22');
  assert.equal(draft.title.length,120);assert.equal(draft.truncated,true);
});
test('event → task preserves displayed occurrence date for recurring events',()=>{
  const original={id:'old-event',title:'Weekly visit',details:'Meet at café',date:'2026-11-01',repeat:'weekly',time:'11:00'};
  const draft=draftTaskFromEvent(original,'2026-11-22');
  assert.deepEqual(draft,{kind:'task',title:'Weekly visit',details:'Meet at café',due:'2026-11-22',high:false,truncated:false});
  const record=buildQuickTask(draft,options);
  assert.equal(validTask(record),true); assert.equal(record.done,false);assert.notEqual(record.id,original.id);
});
test('event → task falls back to original date if invalid occurrence supplied',()=>{
  assert.equal(draftTaskFromEvent({title:'Test',date:'2026-12-01'},'wrong').due,'2026-12-01');
});
test('calendar long description is limited and reported to user',()=>{
  const draft=draftTaskFromEvent({title:'Test',details:'A'.repeat(3000),date:'2026-11-22'},'2026-11-22');
  assert.equal(draft.details.length,2000);assert.equal(draft.truncated,true);
});
test('note → task preserves title and body without altering note',()=>{
  const note={id:'note-1',kind:'text',title:'Buy flour',body:'Two bags',updatedAt:'2026-11-22T12:00:00Z'};
  const before=structuredClone(note);const draft=draftTaskFromNote(note);
  assert.equal(draft.kind,'task');assert.equal(draft.title,'Buy flour');assert.equal(draft.details,'Two bags');
  assert.equal(draft.due,'');assert.equal(validTask(buildQuickTask(draft,options)),true);
  assert.deepEqual(note,before);
});
test('checklist note → task adds incomplete items only',()=>{
  const note={kind:'checklist',title:'Pack bag',body:'Before leaving',items:[{text:'Keys',done:false},{text:'Done',done:true},{text:'Phone',done:false}]};
  const draft=draftTaskFromNote(note);
  assert.match(draft.details,/Before leaving/);assert.match(draft.details,/Keys/);assert.match(draft.details,/Phone/);
  assert.doesNotMatch(draft.details,/Done/);
});
test('large note gets truncated warning; title respects Tasks limit',()=>{
  const draft=draftTaskFromNote({title:'X'.repeat(200),body:'B'.repeat(6000)});
  assert.equal(draft.title.length,140);assert.equal(draft.details.length,2000);assert.equal(draft.truncated,true);
});
test('new draft conversion never saves by itself',()=>{
  const core=read('js/cross-actions-core.js');
  assert.doesNotMatch(core,/setMeta|putNote|appendQuick|indexedDB/);
  const quick=read('js/quick-add.js');
  assert.match(quick,/function openPrefilled\(payload\)/);
  assert.match(quick,/dialog\.showModal\(\);title\.focus\(\);return true/);
  assert.match(quick,/form\.addEventListener\('submit',save\)/);
  assert.match(quick,/if\(dialog\.open\|\|saving/);
});
test('screen actions dispatch to Quick Add with a draft, no direct write',()=>{
  const app=read('js/app.js');
  for(const module of ['js/notes.js','js/tasks.js','js/calendar.js']){
    const source=read(module);
    assert.match(source,/onQuickDraft\(/,module);
  }
  assert.match(app,/quickAdd\?\.openPrefilled\(draft\)/);
  assert.match(read('js/calendar.js'),/draftTaskFromEvent\(original,selected\)/);
  assert.match(read('js/notes.js'),/await flush\(\);\s*if\(dirty\)/);
});
test('new labels exist in Bulgarian and English',()=>{
  for(const key of ['crossToCalendar','crossToTask','crossTruncated','crossSaveFirst']){
    assert.notEqual(translate('bg')(key),key);assert.notEqual(translate('en')(key),key);
  }
});
test('offline cache precaches the cross-action helper',()=>{
  assert.equal(VERSION,'2.6.0');
  const sw=read('sw.js');
  assert.match(sw,/myhub-shell-v2\.6\.0/);
  assert.match(sw,/\.\/js\/cross-actions-core\.js/);
  assert.ok(existsSync(new URL('../js/cross-actions-core.js',import.meta.url)));
});
