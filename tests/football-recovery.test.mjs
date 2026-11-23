import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {footballResultHealth,hasConfirmedResult,needsResultCheck,mergeFootballMatches,singleFootballMatchURL,matchSearchURL,SINGLE_MATCH_COOLDOWN_MS} from '../js/football-recovery-core.js';
import {parseMatches} from '../js/football-core.js';
import {translate} from '../js/i18n.js';
const now=Date.parse('2026-11-23T11:00:00Z');
const fixture=(id=123,extra={})=>({id,homeId:100+id,awayId:200+id,home:'Team A',away:'Team B',time:'2026-11-21T15:00:00Z',finished:false,homeScore:null,awayScore:null,group:4,...extra});
test('Saturday match still missing on Monday is unconfirmed, not final',()=>{
  assert.equal(needsResultCheck(fixture(),now),true);
  assert.deepEqual(footballResultHealth([fixture()],now),{unconfirmed:1,checked:1});
  assert.equal(hasConfirmedResult(fixture()),false);
});
test('actual finished score is confirmed and not counted as missing',()=>{
  const match=fixture(1,{finished:true,homeScore:2,awayScore:1});
  assert.equal(hasConfirmedResult(match),true);assert.equal(needsResultCheck(match,now),false);
  assert.equal(footballResultHealth([match],now).unconfirmed,0);
});
test('finished flag without published score is still missing final result',()=>{
  const match=fixture(1,{finished:true});
  assert.equal(needsResultCheck(match,now),true);
});
test('no false warnings for future and just kicked-off matches or fixtures from distant past',()=>{
  const soon=fixture(1,{time:'2026-11-23T10:00:00Z'});
  const next=fixture(2,{time:'2026-11-25T20:00:00Z'});
  const old=fixture(3,{time:'2026-11-01T20:00:00Z'});
  assert.equal(needsResultCheck(soon,now),false);
  assert.equal(needsResultCheck(next,now),false);
  assert.deepEqual(footballResultHealth([soon,next,old],now),{unconfirmed:0,checked:0});
});
test('merging shorter provider payload preserves missing previous matches',()=>{
  const past=fixture(1);const other=fixture(2);
  assert.deepEqual(mergeFootballMatches([past,other],[{...past,finished:true,homeScore:3,awayScore:2}]).map(m=>m.id),[1,2]);
  assert.deepEqual(mergeFootballMatches([past,other],[{...past,finished:true,homeScore:3,awayScore:2}])[0].homeScore,3);
});
test('confirmed older score is not lost when source responds with an empty score',()=>{
  const old=fixture(1,{finished:true,homeScore:2,awayScore:1});
  const [saved]=mergeFootballMatches([old],[fixture(1)]);
  assert.equal(saved.finished,true);assert.deepEqual([saved.homeScore,saved.awayScore],[2,1]);
});
test('updated confirmed score from provider replaces stale confirmed score',()=>{
  const old=fixture(1,{finished:true,homeScore:2,awayScore:1});
  const [saved]=mergeFootballMatches([old],[fixture(1,{finished:true,homeScore:3,awayScore:1})]);
  assert.equal(saved.homeScore,3);
});
test('no phantom final score fabricated from absent API data',()=>{
  const parsed=parseMatches([{matchID:123,matchDateTimeUTC:'2026-11-21T15:00:00Z',matchIsFinished:false,
    team1:{teamId:101,teamName:'Team A'},team2:{teamId:102,teamName:'Team B'},matchResults:[],goals:[]}]);
  assert.equal(parsed[0].homeScore,null);
  assert.equal(needsResultCheck(parsed[0],now),true);
});
test('single match lookup validates ID and search URL escapes user-provided teams',()=>{
  assert.equal(singleFootballMatchURL(123),'https://api.openligadb.de/getmatchdata/123');
  assert.throws(()=>singleFootballMatchURL(-1));assert.throws(()=>singleFootballMatchURL(1.5));
  const url=matchSearchURL(fixture(1,{home:'A & B'}));
  assert.equal(new URL(url).hostname,'www.google.com');
  assert.ok(new URL(url).searchParams.get('q').includes('A & B'));
  assert.equal(SINGLE_MATCH_COOLDOWN_MS,120000);
});
test('only visible missing score match gets provider check and browser fallback',()=>{
  const f=readFileSync(new URL('../js/football.js',import.meta.url),'utf8');
  assert.ok(f.includes('data-football-check'));assert.ok(f.includes('matchSearchURL(m)'));
  assert.ok(f.includes('mergeFootballMatches(previous,matches)'));
  assert.ok(f.includes("current.key!==data.selected"));
});
test('all Football source-status translations exist in Bulgarian and English',()=>{
  const keys=['footballMissingSummary','footballMissingExplanation','footballNoProviderResult','footballCheckMatch',
    'footballSearchExternal','footballSingleLimited','footballSingleUnavailable','footballSingleUpdated','footballSingleStillMissing'];
  for(const key of keys)for(const lang of ['bg','en'])assert.notEqual(translate(lang)(key),key);
});
test('new module precached with correct version, legacy modules still included',()=>{
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  for(const asset of ['myhub-shell-v2.6.0','js/football-recovery-core.js','js/football-refresh-core.js','js/notes.js','js/weather.js'])assert.ok(sw.includes(asset));
});
