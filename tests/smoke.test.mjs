import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate } from '../js/calculator.js';
import { offsetMinutes, formatOffset } from '../js/world-clock.js';
import { normaliseSettings, validateBackup } from '../js/db.js';
import { DEFAULT_SETTINGS } from '../js/config.js';

const validNote={id:'note-1',kind:'checklist',title:'Shopping',body:'',items:[{id:'item-1',text:'Milk',done:false}],pinned:true,favourite:false,createdAt:'2026-11-19T12:00:00.000Z',updatedAt:'2026-11-19T13:00:00.000Z'};
const backup=()=>({app:'MyHub',format:1,createdAt:'2026-11-19T12:00:00.000Z',data:{notes:[structuredClone(validNote)],settings:{theme:'auto',language:'bg',favourites:['clock','calculator'],timeZones:['Europe/Sofia','Europe/London']},calcHistory:[{expression:'200+10%',result:'220',at:'2026-11-19T12:00:00.000Z'}]}});

test('maths, percentages and parentheses',()=>{
  for(const [expression,expected] of [['2+3×4','14'],['(2+3)×4','20'],['200+10%','220'],['200-10%','180'],['200×10%','20'],['1÷4','0.25'],['-5+10','5'],['0.1+0.2','0.3'],['(100+20)÷3','40'],['12.5+2.5','15']]){
    assert.equal(evaluate(expression),expected,expression);
  }
});
test('no eval, invalid expressions and division by zero',()=>{
  for(const expression of ['1/0','alert(1)','12++','1..2','(1+2','4%foo','', '1e999']) assert.throws(()=>evaluate(expression),undefined,expression);
});
test('time zones handle DST',()=>{
  assert.equal(offsetMinutes('Europe/London',new Date('2026-01-15T12:00:00Z')),0);
  assert.equal(offsetMinutes('Europe/London',new Date('2026-07-15T12:00:00Z')),60);
  assert.equal(offsetMinutes('Europe/Sofia',new Date('2026-01-15T12:00:00Z')),120);
  assert.equal(offsetMinutes('Europe/Sofia',new Date('2026-07-15T12:00:00Z')),180);
  assert.equal(offsetMinutes('Asia/Kolkata',new Date('2026-01-15T12:00:00Z')),330);
  assert.equal(formatOffset(-90),'−1:30');
});
test('settings normalise corrupt data safely',()=>{
  assert.deepEqual(normaliseSettings({theme:'invalid',language:'en',favourites:['calculator','calculator','fake'],timeZones:['Europe/London','fake']}),{
    theme:'auto',language:'en',favourites:['calculator'],timeZones:['Europe/London'],
    weatherCities:structuredClone(DEFAULT_SETTINGS.weatherCities),weatherSelectedId:'newport-shropshire-uk'});
});
test('backup validates expected content',()=>{
  const payload=validateBackup(backup());
  assert.equal(payload.notes[0].title,'Shopping');
  assert.equal(payload.calcHistory[0].result,'220');
});
test('backup rejects duplicates and malicious fields',()=>{
  const b=backup();b.data.notes.push(structuredClone(validNote));
  assert.throws(()=>validateBackup(b));
  const c=backup();c.data.notes[0].items[0].done='false';
  assert.throws(()=>validateBackup(c));
  const d=backup();d.format=2;
  assert.throws(()=>validateBackup(d));
  const e=backup();e.data.settings.timeZones=['Invalid/Zone'];
  assert.throws(()=>validateBackup(e));
});
test('manifest and offline precache contain required files',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  for(const filename of ['js/app.js','js/db.js','js/notes.js','js/calculator.js','js/world-clock.js','js/weather.js','weather.css','js/timer.js','js/timer-core.js','timer.css','js/unit-core.js','js/date-core.js','js/percent-core.js','js/bookmarks.js','js/bookmarks-core.js','js/utilities.js','utilities.css']) assert.ok(sw.includes(filename));
});
