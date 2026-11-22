import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyFootballData,validFootballData,validLeague,leagueListFromAPI,parseMatches,matchStatus,
  visibleMatches,hasPossibleMatch,matchURL,FOOTBALL_BASE,MAX_LEAGUES} from '../js/football-core.js';
import {validateBackup} from '../js/db.js';
import {translate} from '../js/i18n.js';
import {TOOLS,VERSION} from '../js/config.js';
const now=Date.parse('2026-11-20T15:00:00Z');
const m=(options={})=>({id:51001,homeId:11,awayId:22,home:'Real team A',away:'Real team B',
  time:'2026-11-20T18:00:00Z',finished:false,homeScore:null,awayScore:null,group:12,...options});
const apiMatch=(extra={})=>({matchID:51001,matchDateTimeUTC:'2026-11-20T18:00:00Z',matchIsFinished:false,
  group:{groupOrderID:12},team1:{teamId:11,teamName:'Real team A'},team2:{teamId:22,teamName:'Real team B'},
  matchResults:[],goals:[],...extra});
const backup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['notes'],timeZones:['Europe/London']},calcHistory:[]}});
test('empty Football collection keeps legacy database and default valid Bundesliga',()=>{
  const value=emptyFootballData();assert.equal(value.schema,1);assert.equal(value.selected,'bl1|2026');
  assert.ok(validFootballData(value));assert.equal(value.leagues.length,1);
});
test('OpenLigaDB URL is keyless and league parameters safe',()=>{
  assert.equal(matchURL(emptyFootballData().leagues[0]),`${FOOTBALL_BASE}/getmatchdata/bl1/2026`);
  assert.equal(validLeague({...emptyFootballData().leagues[0],shortcut:'../foo'}),false);
});
test('actual league catalogue filters football and limited seasons without inventing leagues',()=>{
  const rows=[{leagueShortcut:'bl1',leagueSeason:'2026',leagueName:'Bundesliga',sport:{sportId:1}},
    {leagueShortcut:'pl',leagueSeason:'2026',leagueName:'Premier League',sport:{sportId:1}},
    {leagueShortcut:'CHL',leagueSeason:'2026',leagueName:'Ice Hockey',sport:{sportId:2}},
    {leagueShortcut:'x',leagueSeason:'2007',leagueName:'Old League',sport:{sportId:1}}];
  const leagues=leagueListFromAPI(rows,2026);
  assert.deepEqual(leagues.map(v=>v.key),['bl1|2026','pl|2026']);
  assert.throws(()=>leagueListFromAPI({error:'404'}));
});
test('API parser never manufactures scores when missing',()=>{
  const [entry]=parseMatches([apiMatch()]);assert.deepEqual([entry.homeScore,entry.awayScore],[null,null]);
  assert.equal(entry.home,'Real team A');assert.equal(entry.finished,false);
});
test('finished scores use published resultTypeID 2, not half-time or unknown',()=>{
  const [entry]=parseMatches([apiMatch({matchIsFinished:true,matchResults:[
    {resultTypeID:1,resultOrderID:1,pointsTeam1:1,pointsTeam2:0},
    {resultTypeID:2,resultOrderID:2,pointsTeam1:2,pointsTeam2:3}]})]);
  assert.deepEqual([entry.homeScore,entry.awayScore],[2,3]);assert.equal(entry.finished,true);
});
test('published goal score used when matchResults is empty, not inferred 0–0',()=>{
  const [entry]=parseMatches([apiMatch({goals:[{scoreTeam1:1,scoreTeam2:1}]})]);
  assert.equal(entry.homeScore,1);assert.equal(entry.awayScore,1);
});
test('invalid records are omitted, duplicates deduplicated, never fake placeholder matches',()=>{
  assert.deepEqual(parseMatches([apiMatch({team1:null}),apiMatch({matchID:0})]),[]);
  assert.equal(parseMatches([apiMatch(),apiMatch()]).length,1);
  assert.deepEqual(parseMatches([]),[]);
  assert.throws(()=>parseMatches('bad'));
});
test('status is only definitive when finished, apparent live is explicitly uncertain',()=>{
  assert.equal(matchStatus(m(),now),'scheduled');
  assert.equal(matchStatus(m({time:'2026-11-20T14:15:00Z'}),now),'possible');
  assert.equal(matchStatus(m({time:'2026-11-19T12:00:00Z'}),now),'unconfirmed');
  assert.equal(matchStatus(m({finished:true,time:'2026-11-20T14:00:00Z'}),now),'finished');
});
test('fixtures sorting, favourite teams, and possible-match checks',()=>{
  const fixtures=[m({id:1,time:'2026-11-19T18:00:00Z',finished:true,homeScore:2,awayScore:1}),
    m({id:2,time:'2026-11-20T14:30:00Z'}),m({id:3,time:'2026-11-21T15:00:00Z',homeId:33,awayId:44})];
  assert.equal(visibleMatches(fixtures,'all',[],now).length,3);
  assert.deepEqual(visibleMatches(fixtures,'finished',[],now).map(x=>x.id),[1]);
  assert.deepEqual(visibleMatches(fixtures,'favorites',[33],now).map(x=>x.id),[3]);
  assert.ok(hasPossibleMatch(fixtures,now));
});
test('bad data, too many leagues, duplicate team favourites and invalid scores are rejected',()=>{
  const value=emptyFootballData();value.cache[value.selected]={fetchedAt:new Date(now).toISOString(),matches:[m()]};
  assert.ok(validFootballData(value));
  assert.equal(validFootballData({...value,favoriteTeams:[11,11]}),false);
  assert.equal(validFootballData({...value,leagues:Array.from({length:MAX_LEAGUES+1},(_,i)=>({...value.leagues[0],key:`x${i}|2026`,shortcut:`x${i}`}))}),false);
  assert.equal(validFootballData({...value,cache:{[value.selected]:{...value.cache[value.selected],matches:[m({homeScore:2,awayScore:null})]}}}),false);
});
test('existing v0.1–v0.5 archives restore with default Football state',()=>{
  const archive=backup();
  assert.deepEqual(validateBackup(archive).footballData,emptyFootballData());
});
test('Football favourites and cached matches are included in a validated JSON backup',()=>{
  const archive=backup(),value=emptyFootballData();value.favoriteTeams=[11];
  value.cache[value.selected]={fetchedAt:new Date(now).toISOString(),matches:[m()]};
  archive.data.footballData=value;
  assert.equal(validateBackup(archive).footballData.favoriteTeams[0],11);
  archive.data.footballData.favoriteTeams=[11,11];
  assert.throws(()=>validateBackup(archive),/football|футбол/i);
});
test('existing module assets and v0.6 football files are in offline shell',()=>{
  assert.equal(VERSION,'2.0.0');assert.ok(TOOLS.some(x=>x.id==='football'));
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  for(const item of ['myhub-shell-v2.0.0','js/football.js','js/football-core.js','football.css','js/tasks.js','js/weather.js','js/calendar.js'])assert.ok(sw.includes(item),item);
  const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(page.includes('football.css'));
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(app.includes("route==='football'"));
});
test('all new UI translation keys exist in Bulgarian and English',()=>{
  const code=readFileSync(new URL('../js/football.js',import.meta.url),'utf8');
  for(const match of code.matchAll(/\bt\('([A-Za-z0-9]+)'\)/g)){
    for(const lang of ['bg','en'])assert.notEqual(translate(lang)(match[1]),match[1],`${lang}:${match[1]}`);
  }
  for(const key of ['football','footballDesc','footballStatusPossible','footballFavorites','footballNoMatches']){
    for(const lang of ['bg','en'])assert.notEqual(translate(lang)(key),key);
  }
});
