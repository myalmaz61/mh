import test from 'node:test';
import assert from 'node:assert/strict';
import { parseForecast, parsePlaces, forecastUrl, geocodeUrl, validSnapshot, weatherDescription } from '../js/weather.js';
import { normaliseSettings, validateBackup } from '../js/db.js';
import { DEFAULT_SETTINGS } from '../js/config.js';

export const exampleApi={
  current:{time:'2026-11-19T22:15',temperature_2m:6.3,apparent_temperature:2.9,relative_humidity_2m:92,wind_speed_10m:12.7,precipitation:0.2,weather_code:61,is_day:0},
  daily:{time:['2026-11-19','2026-11-20'],temperature_2m_min:[2.5,1.2],temperature_2m_max:[8.4,7.7],precipitation_sum:[2.5,0],precipitation_probability_max:[80,20],wind_speed_10m_max:[25.3,17],weather_code:[61,2]},
  hourly:{time:['2026-11-19T21:00','2026-11-19T22:00','2026-11-19T23:00','2026-11-20T00:00'],temperature_2m:[7,6.3,5.8,5.2],precipitation_probability:[10,60,70,20]},
};
const backup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['calculator'],timeZones:['Europe/London']},calcHistory:[]}});

test('Open-Meteo forecast converted and bounded for offline use',()=>{
  const snap=parseForecast(exampleApi);
  assert.equal(snap.current.temp,6.3);
  assert.equal(snap.current.code,61);
  assert.equal(snap.daily[0].prob,80);
  assert.equal(snap.daily[1].rain,0);
  assert.deepEqual(snap.hours.map(x=>x.time),['2026-11-19T22:00','2026-11-19T23:00','2026-11-20T00:00']);
  assert.equal(validSnapshot({fetchedAt:'2026-11-19T22:20:00.000Z',...snap}),true);
  assert.equal(weatherDescription(61,'bg').text,'Дъжд');
  assert.equal(weatherDescription(95,'en').text,'Thunderstorm');
});
test('Malformed or partial API results cannot overwrite working offline cache',()=>{
  assert.throws(()=>parseForecast({current:exampleApi.current}));
  assert.throws(()=>parseForecast({current:{...exampleApi.current,temperature_2m:'warm'},daily:exampleApi.daily}));
  assert.throws(()=>parseForecast({...exampleApi,daily:{...exampleApi.daily,temperature_2m_max:[null,3]}}));
  assert.equal(validSnapshot({fetchedAt:'yesterday',current:exampleApi.current,daily:[],hours:[]}),false);
});
test('Geocoding keeps names and coordinates but no extra API data',()=>{
  const p=parsePlaces({results:[{id:432,name:'Sofia',admin1:'Sofia-City',country:'Bulgaria',latitude:42.6977,longitude:23.3219,extra:'remove me'},
    {id:22,name:'<script>hi</script>',latitude:200,longitude:1}]});
  assert.deepEqual(p,[{id:'geo-432',name:'Sofia',region:'Sofia-City',country:'Bulgaria',latitude:42.6977,longitude:23.3219}]);
  const forecast=new URL(forecastUrl({latitude:52.7688,longitude:-2.3785}));
  assert.equal(forecast.hostname,'api.open-meteo.com');
  assert.equal(forecast.searchParams.get('forecast_days'),'7');
  assert.equal(new URL(geocodeUrl('Newport, UK')).searchParams.get('name'),'Newport, UK');
});
test('Existing v0.1 JSON backup remains restorable with default weather city',()=>{
  const result=validateBackup(backup());
  assert.deepEqual(result.settings.weatherCities,DEFAULT_SETTINGS.weatherCities);
  assert.equal(result.settings.weatherSelectedId,'newport-shropshire-uk');
  assert.deepEqual(result.weatherCache,{});
});
test('v0.2 backup accepts valid saved weather cache and rejects corrupt entries',()=>{
  const b=backup();const city=structuredClone(DEFAULT_SETTINGS.weatherCities[0]);
  b.data.settings.weatherCities=[city];b.data.settings.weatherSelectedId=city.id;
  const snapshot={fetchedAt:'2026-11-19T22:20:00.000Z',...parseForecast(exampleApi)};
  b.data.weatherCache={[city.id]:snapshot};
  assert.equal(validateBackup(b).weatherCache[city.id].current.temp,6.3);
  b.data.weatherCache[city.id].daily[0].max='bad';
  assert.throws(()=>validateBackup(b));
});
test('Weather city settings validated with max eight, duplicates removed and empty allowed',()=>{
  const good=structuredClone(DEFAULT_SETTINGS.weatherCities[0]);
  assert.deepEqual(normaliseSettings({weatherCities:[],weatherSelectedId:''}).weatherCities,[]);
  assert.deepEqual(normaliseSettings({weatherCities:[good,good,{id:'oops',name:'X',region:'',country:'',latitude:900,longitude:0}]}).weatherCities,[good]);
  const b=backup();b.data.settings.weatherCities=[good,good];b.data.settings.weatherSelectedId=good.id;
  assert.throws(()=>validateBackup(b));
});

test('All Weather UI strings are translated into Bulgarian and English',async()=>{
  const { readFileSync }=await import('node:fs');
  const { translate }=await import('../js/i18n.js');
  const js=readFileSync(new URL('../js/weather.js',import.meta.url),'utf8');
  for(const [,key] of js.matchAll(/\bt\('([A-Za-z0-9]+)'\)/g)){
    assert.notEqual(translate('bg')(key),key,`missing BG: ${key}`);
    assert.notEqual(translate('en')(key),key,`missing EN: ${key}`);
  }
});

test('The offline cache remains versioned and only caches app origin assets',async()=>{
  const { readFileSync }=await import('node:fs');
  const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.ok(worker.includes('myhub-shell-v0.3.0'));
  assert.ok(worker.includes("url.origin!==self.location.origin"));
  assert.ok(!worker.includes('api.open-meteo.com'));
});
