import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingRainSummary} from '../js/weather-rain-core.js';
import {parseForecast} from '../js/weather.js';
import {readFileSync} from 'node:fs';
import {translate} from '../js/i18n.js';
test('three-hour overview uses highest probability, not made-up precipitation amounts',()=>{
  const hours=[{time:'2026-11-23T09:00',prob:25},{time:'2026-11-23T10:00',prob:70},{time:'2026-11-23T11:00',prob:5},{time:'2026-11-23T12:00',prob:100}];
  assert.deepEqual(upcomingRainSummary(hours),{count:3,maxProbability:70});
});
test('missing and malformed rainfall probabilities are ignored',()=>{
  assert.equal(upcomingRainSummary([]),null);
  assert.equal(upcomingRainSummary([{time:'A',prob:null}]),null);
  assert.deepEqual(upcomingRainSummary([{time:'A',prob:0},{time:'B',prob:150}]),{count:1,maxProbability:0});
  assert.equal(upcomingRainSummary([{}],99),null);
});
test('weather brief is rendered using cached existing hourly data and translated',()=>{
  const weather=readFileSync(new URL('../js/weather.js',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.ok(weather.includes('upcomingRainSummary(snapshot.hours)'));
  assert.ok(shell.includes('js/weather-rain-core.js'));
  for(const lang of ['bg','en'])for(const key of ['weatherRainNextHours','weatherMaxRainChance']) assert.notEqual(translate(lang)(key),key);
});
