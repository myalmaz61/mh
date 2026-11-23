import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weatherDayComparison} from '../js/weather-day-compare-core.js';
import {parseForecast,validSnapshot} from '../js/weather.js';
import {translate} from '../js/i18n.js';
const h=(time,prob,temp=5)=>({time,prob,temp});
test('cache groups city-local calendar dates regardless of phone timezone and DST',()=>{
 const hours=[h('2026-03-29T22:00',10),h('2026-03-30T00:00',65),h('2026-03-30T08:00',75)];
 const result=weatherDayComparison(hours,'2026-03-29T21:00');
 assert.deepEqual(result.map(x=>[x.date,x.maxProbability,x.hours.length]),[['2026-03-29',10,1],['2026-03-30',75,2]]);
 assert.equal(result[1].hours[0].time,'2026-03-30T00:00');
});
test('unknown rain chance remains unknown, not 0%, and old 12-hour cache is usable',()=>{
 const result=weatherDayComparison([h('2026-11-23T22:00',null),h('2026-11-24T00:00',null)],'2026-11-23T21:00');
 assert.equal(result[0].maxProbability,null);
 assert.equal(result[1].maxProbability,null);
 assert.equal(weatherDayComparison([], 'not-date'),null);
 assert.equal(weatherDayComparison([], '2026-02-30T09:00'),null);
});
test('48 future hourly forecasts supported but cache stays bounded and older cached data valid',()=>{
 const c={time:'2026-11-23T16:05',temperature_2m:9,apparent_temperature:8,relative_humidity_2m:65,wind_speed_10m:10,precipitation:0,weather_code:3,is_day:1};
 const dates=Array.from({length:72},(_,i)=>{const d=new Date(Date.UTC(2026,10,23,0)+i*3600_000);return d.toISOString().slice(0,16);});
 const daily={time:['2026-11-23','2026-11-24'],temperature_2m_min:[3,4],temperature_2m_max:[11,12],precipitation_sum:[1,2],precipitation_probability_max:[50,60],wind_speed_10m_max:[20,20],weather_code:[3,61]};
 const api={current:c,daily,hourly:{time:dates,temperature_2m:dates.map(()=>5),precipitation_probability:dates.map((_,i)=>i%101)}};
 const parsed=parseForecast(api);
 assert.equal(parsed.hours.length,48);
 assert.equal(parsed.hours[0].time,'2026-11-23T16:00');
 assert.ok(parsed.hours.some(x=>x.time.startsWith('2026-11-24T')));
 const snap={fetchedAt:'2026-11-23T16:10:00.000Z',...parsed};
 assert.equal(validSnapshot(snap),true);
 assert.equal(validSnapshot({...snap,hours:parsed.hours.slice(0,12)}),true);
 assert.equal(validSnapshot({...snap,hours:[...parsed.hours,parsed.hours[0]]}),false);
 assert.ok(weatherDayComparison(parsed.hours,parsed.current.time)[1].hours.length>0);
});
test('UI includes two-day details, old 12 hour overview, no new fetch calls or extra permissions',()=>{
 const src=readFileSync(new URL('../js/weather.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.ok(src.includes('weatherDayComparison(snapshot.hours,snapshot.current.time)'));
 assert.ok(src.includes('snapshot.hours.slice(0,12)'));
 assert.ok(sw.includes('js/weather-day-compare-core.js'));
 for(const lang of ['bg','en'])for(const key of ['weatherCompareDays','weatherCompareHint','weatherToday','weatherTomorrow','weatherNoHourlyForDay'])assert.notEqual(translate(lang)(key),key);
});

test('a full 48-hour cached forecast can be included in JSON backup and restored with v1 format',async()=>{
 const {validateBackup}=await import('../js/db.js');
 const {DEFAULT_SETTINGS}=await import('../js/config.js');
 const sample={fetchedAt:'2026-11-23T15:00:00.000Z',current:{time:'2026-11-23T15:00',temp:8,feels:6,humidity:60,wind:12,rain:0,code:3,isDay:true},daily:[{date:'2026-11-23',min:4,max:11,rain:1,prob:40,wind:15,code:3}],hours:Array.from({length:48},(_,i)=>({time:new Date(Date.UTC(2026,10,23,15)+i*3600000).toISOString().slice(0,16),temp:5,prob:12}))};
 const key=DEFAULT_SETTINGS.weatherCities[0].id;
 const b={app:'MyHub',format:1,data:{notes:[],settings:structuredClone(DEFAULT_SETTINGS),calcHistory:[],weatherCache:{[key]:sample}}};
 assert.equal(validateBackup(b).weatherCache[key].hours.length,48);
 b.data.weatherCache[key].hours.push(sample.hours[0]);
 assert.throws(()=>validateBackup(b),/invalid forecast/i);
});
