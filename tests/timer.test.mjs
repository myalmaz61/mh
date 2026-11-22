import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultTimerData, MAX_TIMER_MS, MAX_STOPWATCH_MS, MAX_LAPS,
  validTimerData, normaliseTimerData, remainingCountdown, stopwatchElapsed,
  settleTimer, snapshotTimerForBackup, formatDuration } from '../js/timer-core.js';
import { validateBackup } from '../js/db.js';
import { translate } from '../js/i18n.js';
import { TOOLS, VERSION } from '../js/config.js';

const legacyBackup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['notes','calculator'],timeZones:['Europe/London']},calcHistory:[]}});
const v2Backup=()=>{const x=legacyBackup();x.data.weatherCache={};x.data.settings.weatherCities=[];x.data.settings.weatherSelectedId='';return x;};
test('default durations are sensible and valid',()=>{
  const data=defaultTimerData();
  assert.equal(data.countdown.durationMs,300_000);
  assert.deepEqual(data.presets.map(p=>p.seconds),[300,600,1500]);
  assert.ok(validTimerData(data));
  assert.deepEqual(normaliseTimerData(null),data);
});
test('countdown uses an absolute deadline across pauses, reloads, and long suspension',()=>{
  const data=defaultTimerData();
  data.countdown={phase:'running',durationMs:120_000,remainingMs:120_000,endAt:1_800_000_120_000};
  assert.equal(remainingCountdown(data.countdown,1_800_000_030_000),90_000);
  assert.equal(remainingCountdown(data.countdown,1_800_000_130_000),0);
  assert.equal(validTimerData(data),true);
  const finished=settleTimer(data,1_800_000_130_000);
  assert.equal(finished.countdown.phase,'finished');
  assert.equal(finished.countdown.endAt,null);
  assert.equal(finished.countdown.remainingMs,0);
  assert.equal(data.countdown.phase,'running'); // pure, does not mutate
});
test('stopwatch uses its start timestamp after resuming or a page reload',()=>{
  const data=defaultTimerData();
  data.stopwatch={phase:'running',elapsedMs:0,startedAt:1_800_000_000_000,laps:[30_500,72_000]};
  assert.equal(stopwatchElapsed(data.stopwatch,1_800_000_095_550),95_550);
  const frozen=snapshotTimerForBackup(data,1_800_000_095_550);
  assert.equal(frozen.stopwatch.phase,'paused');
  assert.equal(frozen.stopwatch.elapsedMs,95_550);
  assert.equal(frozen.stopwatch.startedAt,null);
  assert.equal(validTimerData(frozen),true);
});
test('backup freezes an active timer without changing live data or adding time during restore',()=>{
  const data=defaultTimerData();
  data.countdown={phase:'running',durationMs:70_000,remainingMs:70_000,endAt:1_800_000_070_000};
  data.stopwatch={phase:'running',elapsedMs:0,startedAt:1_800_000_010_000,laps:[1000]};
  const snap=snapshotTimerForBackup(data,1_800_000_040_000);
  assert.deepEqual([snap.countdown.phase,snap.countdown.remainingMs,snap.countdown.endAt],['paused',30_000,null]);
  assert.equal(snap.stopwatch.elapsedMs,30_000);
  assert.equal(snap.stopwatch.phase,'paused');
  assert.equal(data.stopwatch.phase,'running');
  assert.ok(validTimerData(snap));
});
test('backup after expiration is finished, never an active ghost alarm',()=>{
  const data=defaultTimerData();
  data.countdown={phase:'running',durationMs:1000,remainingMs:1000,endAt:1_800_000_000_999};
  const frozen=snapshotTimerForBackup(data,1_800_000_010_000);
  assert.equal(frozen.countdown.phase,'finished');
});
test('format milliseconds without drift and including lap hundredths',()=>{
  assert.equal(formatDuration(0),'00:00:00');
  assert.equal(formatDuration(MAX_TIMER_MS),'23:59:59');
  assert.equal(formatDuration(3_723_456,{hundredths:true}),'01:02:03.45');
  assert.equal(formatDuration(-20),'00:00:00');
});
test('reject corrupted timers, dangerous sizes, duplicated presets and invalid lap order',()=>{
  for(const change of [
    x=>x.countdown.durationMs=MAX_TIMER_MS+1000,
    x=>{x.countdown.phase='running';x.countdown.endAt=null;},
    x=>x.presets.push({...x.presets[0]}),
    x=>x.presets[0].name='<'.repeat(33),
    x=>x.presets[0].seconds=0,
    x=>x.stopwatch.laps=[20,10],
    x=>{x.stopwatch.phase='running';x.stopwatch.startedAt='yesterday';},
    x=>x.stopwatch.elapsedMs=MAX_STOPWATCH_MS+1,
    x=>x.stopwatch.laps=Array.from({length:MAX_LAPS+1},(_,i)=>i+1),
  ]){
    const x=defaultTimerData();change(x);
    assert.equal(validTimerData(x),false,change.toString());
    assert.equal(validTimerData(normaliseTimerData(x)),true);
  }
});
test('v0.1 and v0.2 backups restore with safe timer defaults',()=>{
  for(const backup of [legacyBackup(),v2Backup()]){
    const result=validateBackup(backup);
    assert.deepEqual(result.timerData,defaultTimerData());
  }
});
test('v0.3 backup restores valid timer and refuses corrupt timer atomically',()=>{
  const b=v2Backup(); b.data.timerData=defaultTimerData();
  b.data.timerData.presets.push({id:'tea',name:'Tea',seconds:180});
  assert.equal(validateBackup(b).timerData.presets.at(-1).seconds,180);
  b.data.timerData.stopwatch.elapsedMs='wrong';
  assert.throws(()=>validateBackup(b),/timer|таймер/i);
});
test('new module and offline files are present in app and service worker',()=>{
  assert.equal(VERSION,'1.6.0');
  assert.ok(TOOLS.some(x=>x.id==='timer'));
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const v of ['mountTimer','route===\'timer\''])assert.ok(app.includes(v));
  for(const f of ['js/timer.js','js/timer-core.js','timer.css'])assert.ok(sw.includes(f));
  assert.ok(html.includes('timer.css'));
  assert.ok(sw.includes('myhub-shell-v1.6.0'));
});
test('all timer UI translation keys exist in BG and EN',()=>{
  const js=readFileSync(new URL('../js/timer.js',import.meta.url),'utf8');
  for(const [,key] of js.matchAll(/\bt\('([A-Za-z0-9]+)'\)/g)){
    assert.notEqual(translate('bg')(key),key,`BG ${key}`);
    assert.notEqual(translate('en')(key),key,`EN ${key}`);
  }
  for(const state of ['Idle','Running','Paused','Finished']){
    const key='timerStatus'+state;
    assert.notEqual(translate('bg')(key),key);
    assert.notEqual(translate('en')(key),key);
  }
});
