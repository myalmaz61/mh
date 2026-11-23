import test from 'node:test';
import assert from 'node:assert/strict';
import {FOOTBALL_REFRESH,matchRefreshPhase,footballRefreshDelay} from '../js/football-refresh-core.js';
import {readFileSync} from 'node:fs';
const now=Date.parse('2026-11-23T15:00:00Z');
const fixture=(hours,finished=false)=>({time:new Date(now+hours*3600000).toISOString(),finished});
test('pre-match and post-match periods refresh sooner; quiet schedule remains rare',()=>{
  assert.equal(matchRefreshPhase([fixture(1)],now),'near');
  assert.equal(matchRefreshPhase([fixture(-1)],now),'active');
  assert.equal(matchRefreshPhase([fixture(-4.5)],now),'near');
  assert.equal(matchRefreshPhase([fixture(-2,true)],now),'near');
  assert.equal(matchRefreshPhase([fixture(-9,true)],now),'quiet');
  assert.equal(matchRefreshPhase([],now),'quiet');
});
test('match refresh improves live timeliness but respects conservative cooldown',()=>{
  assert.equal(footballRefreshDelay([fixture(-0.5)],false,now),4*60_000);
  assert.equal(footballRefreshDelay([fixture(-0.5)],true,now),90_000);
  assert.equal(footballRefreshDelay([fixture(0.75)],false,now),12*60_000);
  assert.equal(footballRefreshDelay([fixture(0.75)],true,now),3*60_000);
  assert.equal(footballRefreshDelay([],false,now),2*60*60_000);
  assert.equal(footballRefreshDelay([],true,now),10*60_000);
});
test('bad fixture input never schedules excessive updates',()=>{
  assert.equal(matchRefreshPhase([{time:'invalid',finished:false}],now),'quiet');
  assert.equal(footballRefreshDelay(undefined,false,now),FOOTBALL_REFRESH.quietAuto);
});
test('football applies policy to manual and automatic checks, assets are precached',()=>{
  const code=readFileSync(new URL('../js/football.js',import.meta.url),'utf8');
  const cache=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.ok(code.includes('footballRefreshDelay(snapshot?.matches||[],force)'));
  assert.ok(code.includes('void loadMatches();'));
  assert.ok(cache.includes('js/football-refresh-core.js'));
});
