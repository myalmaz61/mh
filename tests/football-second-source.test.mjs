import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate} from '../js/i18n.js';
import {isValidFootballDay,dayUtc,sportScoreDayUrl,parseSportScoreFixtures,sportScoreFiltered,sportScoreShownScore,SECOND_SOURCE_MIN_REFRESH_MS,lastSaturdayUtc,validSportScoreCompetition,sportScoreForCompetition,SECOND_SOURCE_PREMIER_LEAGUE,SECOND_SOURCE_PREMIER_LEAGUE_WEB} from '../js/football-second-source-core.js';
const match=(extra={})=>({home:'Team A',away:'Team B',home_score:2,away_score:1,status:'finished',time:'2026-11-22T16:00:00Z',competition:'Example League',...extra});
test('SportScore date is strict and cannot contain paths or query parameters',()=>{
  assert.equal(isValidFootballDay('2026-11-22'),true);assert.equal(isValidFootballDay('2026-02-29'),false);
  assert.equal(isValidFootballDay('2024-02-29'),true);assert.equal(isValidFootballDay('2026-11-22&team=x'),false);
  assert.throws(()=>sportScoreDayUrl('../path'));
  const u=new URL(sportScoreDayUrl('2026-11-22'));
  assert.equal(u.origin,'https://sportscore.com');assert.equal(u.pathname,'/api/v1/fixtures/');
  assert.equal(u.searchParams.get('date'),'2026-11-22');assert.equal(u.searchParams.get('sport'),'football');
});
test('date-based selection covers yesterday and Saturday',()=>{
  const monday=new Date('2026-11-23T12:00:00Z');
  assert.equal(dayUtc(1,monday),'2026-11-22');assert.equal(dayUtc(2,monday),'2026-11-21');
});
test('finished game shows only genuine published numeric score',()=>{
  const rows=parseSportScoreFixtures({matches:[match()]});
  assert.equal(rows.length,1);assert.equal(rows[0].status,'finished');assert.equal(sportScoreShownScore(rows[0]),'2 : 1');
});
test('no unconfirmed results falsely converted to final scores',()=>{
  const row=parseSportScoreFixtures({fixtures:[match({status:'UNKNOWN'})]})[0];
  assert.equal(row.status,'unconfirmed');assert.equal(sportScoreShownScore(row),'– : –');
});
test('missing score is never assumed to be zero',()=>{
  const row=parseSportScoreFixtures({matches:[match({home_score:null,away_score:null})]})[0];
  assert.equal(sportScoreShownScore(row),'– : –');
});
test('zero-zero is a legitimate confirmed score',()=>{
  const row=parseSportScoreFixtures({matches:[match({home_score:0,away_score:0})]})[0];
  assert.equal(sportScoreShownScore(row),'0 : 0');
});
test('live scores are labelled live and not final',()=>{
  const row=parseSportScoreFixtures({matches:[match({status:'live'})]})[0];
  assert.equal(row.status,'live');assert.equal(sportScoreShownScore(row),'2 : 1');
});
test('handles simple nested team fields, duplicates and invalid rows',()=>{
  const nested={home:{name:'Alpha'},away:{name:'Beta'},homeScore:1,awayScore:0,status:'FT',kickoff:'2026-11-22T16:00:00Z'};
  const rows=parseSportScoreFixtures({data:{matches:[nested,nested,{home:'',away:'Beta',status:'finished'}]}});
  assert.equal(rows.length,1);assert.equal(rows[0].home,'Alpha');assert.equal(rows[0].status,'finished');
});
test('fails closed for unfamiliar envelope instead of rendering fictitious results',()=>{
  assert.throws(()=>parseSportScoreFixtures({unexpected:'hi'}));
  assert.throws(()=>parseSportScoreFixtures({matches:'bad'}));
});
test('search matches team or competition and limits result rendering',()=>{
  const rows=parseSportScoreFixtures({matches:[match(),match({home:'Club C',away:'Club D',time:'2026-11-22T17:00:00Z'})]});
  assert.equal(sportScoreFiltered(rows,'team a').length,1);
  assert.equal(sportScoreFiltered(rows,'example league').length,2);
  assert.deepEqual(sportScoreFiltered(rows,'nothing'),[]);
});
test('second provider panel is opt-in, attributed and does not save over OpenLigaDB',()=>{
  const js=readFileSync(new URL('../js/football-second-source.js',import.meta.url),'utf8');
  const football=readFileSync(new URL('../js/football.js',import.meta.url),'utf8');
  const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.ok(js.includes('sportScoreDayUrl(day,competition.value)'));
  assert.ok(!js.includes('setMeta('));
  assert.ok(football.includes('football-second-details'));
  assert.ok(page.includes('rel="dofollow"'));
  assert.ok(page.includes('href="https://sportscore.com/"'));
  assert.ok(sw.includes('football-second-source.js'));
  assert.ok(sw.includes('football-second-source-core.js'));
  assert.equal(SECOND_SOURCE_MIN_REFRESH_MS,300000);
});
test('Bulgarian and English language strings exist for second source',()=>{
  const keys=['footballSecondTitle','footballSecondHint','footballSecondYesterday','footballSecondFilter',
    'footballSecondFinal','footballSecondLive','footballSecondUnknown','footballSecondError',
    'footballSecondOffline','footballSecondDisclaimer'];
  for(const lang of ['bg','en'])for(const key of keys)assert.notEqual(translate(lang)(key),key);
});

test('SportScore Premier League is a named, validated competition, not a local text search',()=>{
  assert.equal(SECOND_SOURCE_PREMIER_LEAGUE,'premier-league');
  assert.equal(validSportScoreCompetition('premier-league'),true);
  assert.equal(validSportScoreCompetition(''),true);
  assert.equal(validSportScoreCompetition('premier-league&limit=500'),false);
  const epl=new URL(sportScoreDayUrl('2026-11-21','premier-league'));
  assert.equal(epl.searchParams.get('competition'),'premier-league');
  assert.equal(epl.searchParams.get('limit'),'200');
  const all=new URL(sportScoreDayUrl('2026-11-21',''));
  assert.equal(all.searchParams.has('competition'),false);
  assert.throws(()=>sportScoreDayUrl('2026-11-21','../../evil'));
  assert.match(SECOND_SOURCE_PREMIER_LEAGUE_WEB,/sportscore\.com\/football\/competition\/england\//);
});
test('Saturday shortcut includes the previous Saturday from Monday',()=>{
  assert.equal(lastSaturdayUtc(new Date('2026-11-23T16:00:00Z')),'2026-11-21');
  assert.equal(lastSaturdayUtc(new Date('2026-11-21T20:00:00Z')),'2026-11-21');
  assert.equal(lastSaturdayUtc(new Date('2026-11-22T00:00:00Z')),'2026-11-21');
});
test('Premier League results exclude explicitly unrelated competitions',()=>{
  const rows=[
    {home:'A',away:'B',competition:'English Premier League'},
    {home:'C',away:'D',competition:'Premier League'},
    {home:'E',away:'F',competition:'Women Premier League'},
    {home:'G',away:'H',competition:'La Liga'},
    {home:'I',away:'J',competition:''},
    {home:'K',away:'L',competition:'english-premier-league'},
  ];
  assert.equal(sportScoreForCompetition(rows,'premier-league').length,4);
  assert.equal(sportScoreForCompetition(rows,'').length,6);
  assert.deepEqual(sportScoreForCompetition(rows,'x'),[]);
});
test('SportScore parser handles one additional documented-style data array envelope',()=>{
  const parsed=parseSportScoreFixtures({data:[match({competition:'English Premier League'})]});
  assert.equal(parsed.length,1);
  assert.equal(sportScoreShownScore(parsed[0]),'2 : 1');
});
test('Premier League selector and official results link are visible in football UI',()=>{
  const js=readFileSync(new URL('../js/football-second-source.js',import.meta.url),'utf8');
  const football=readFileSync(new URL('../js/football.js',import.meta.url),'utf8');
  for(const s of ['football-second-competition','premier-league','football-second-saturday','footballSecondOpenEpl']) assert.ok(football.includes(s),s);
  assert.ok(js.includes('competition.value'));
  assert.ok(!js.includes('setMeta('));
});
