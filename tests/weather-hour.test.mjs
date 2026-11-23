import test from 'node:test';
import assert from 'node:assert/strict';
import {hourlyProbabilityBar} from '../js/weather-hour-core.js';
import {translate} from '../js/i18n.js';
import {readFileSync} from 'node:fs';

test('Probability bars respect 0..100 including endpoints and decimals',()=>{
  assert.equal(hourlyProbabilityBar(0),0);
  assert.equal(hourlyProbabilityBar(100),100);
  assert.equal(hourlyProbabilityBar(43.7),44);
});
test('Unknown and malformed data is not fabricated as 0% probability',()=>{
  for (const bad of [null,undefined,NaN,Infinity,-1,101,'75',{},true])
    assert.equal(hourlyProbabilityBar(bad),null);
});
test('Weather cards show cached probability text AND a visual bar, without extra API calls',()=>{
  const source=readFileSync(new URL('../js/weather.js',import.meta.url),'utf8');
  assert.match(source,/hourlyProbabilityBar\(hour\.prob\)/);
  assert.match(source,/weather-rain-track/);
  assert.match(source,/probability === null \? '–'/);
  assert.match(source,/aria-hidden="true"/);
  assert.ok(!readFileSync(new URL('../js/weather-hour-core.js',import.meta.url),'utf8').includes('fetch('));
  for(const language of ['bg','en'])assert.notEqual(translate(language)('weatherHoursHint'),'weatherHoursHint');
});
test('SW includes new Weather helper and keeps unique versioned shell',()=>{
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(sw,/myhub-shell-v3\.1\.0/);
  assert.match(sw,/js\/weather-hour-core\.js/);
  assert.match(sw,/js\/weather-rain-core\.js/);
});
