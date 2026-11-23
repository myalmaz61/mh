import test from 'node:test';
import assert from 'node:assert/strict';
import {rainChanceWindow} from '../js/weather-rain-core.js';
import {translate} from '../js/i18n.js';
import {readFileSync} from 'node:fs';
const h=(hour,prob)=>({time:`2026-11-23T${String(hour).padStart(2,'0')}:00`,prob});
test('First ≥50% is selected in city-local hourly order, not based on maximum',()=>{
 assert.deepEqual(rainChanceWindow([h(9,20),h(10,65),h(11,90)]),{count:3,threshold:50,firstTime:'2026-11-23T10:00',firstProbability:65,maxProbability:90});
});
test('Below threshold never claims no rain',()=>{
 assert.deepEqual(rainChanceWindow([h(9,0),h(10,49)]),{count:2,threshold:50,firstTime:null,firstProbability:null,maxProbability:49});
});
test('Malformed/missing data is rejected without manufacturing a rain hour',()=>{
 assert.equal(rainChanceWindow([]),null);
 assert.equal(rainChanceWindow([h(9,null)]),null);
 assert.equal(rainChanceWindow([h(9,101)]),null);
 assert.equal(rainChanceWindow([h(9,10)],0),null);
 assert.equal(rainChanceWindow([h(9,10)],101),null);
 assert.equal(rainChanceWindow([{time:'not-hour',prob:70}]),null);
});
test('Only 12 cached hours are considered, never a new API call',()=>{
 const hours=Array.from({length:13},(_,i)=>h(i, i===12?95:10));
 assert.deepEqual(rainChanceWindow(hours),{count:12,threshold:50,firstTime:null,firstProbability:null,maxProbability:10});
 const src=readFileSync(new URL('../js/weather.js',import.meta.url),'utf8');
 assert.ok(src.includes('rainChanceWindow(snapshot.hours)'));
 for(const lang of ['bg','en'])for(const key of ['weatherRainFirstHigh','weatherRainBelowThreshold'])assert.notEqual(translate(lang)(key),key);
});
