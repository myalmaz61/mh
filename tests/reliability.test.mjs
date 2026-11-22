import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, DEFAULT_SETTINGS } from '../js/config.js';
import { validateBackup, normaliseSettings } from '../js/db.js';
import { previewBackup } from '../js/backup-preview-core.js';
import { pwaAssessment } from '../js/pwa-health-core.js';
const old=()=>({app:'MyHub',format:1,version:'0.1.0',createdAt:'2026-11-19T12:00:00.000Z',data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['notes'],timeZones:['Europe/London']},calcHistory:[]}});
test('v1.7 keeps the same database and backup schema',()=>{
  assert.equal(VERSION,'1.7.0');
  const db=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
  assert.match(db,/const DB_NAME = 'myhub-local'/);
  assert.match(db,/const DB_VERSION = 1/);
  assert.match(db,/format:1/);
});
test('read-only backup preview for legacy archive shows defaults accurately',()=>{
  const archive=old(), clean=validateBackup(archive);
  const preview=previewBackup(archive,clean);
  assert.equal(preview.counts.notes,0);
  assert.equal(preview.counts.tasks,0);
  assert.equal(preview.counts.events,0);
  assert.equal(preview.counts.lists,0);
  assert.equal(preview.counts.bookmarks,0);
  assert.equal(preview.counts.rssArticles,0);
  assert.equal(preview.counts.leagues,1); // default Bundesliga, not an invented live score
  assert.ok(preview.missing.includes('tasksData'));
  assert.ok(preview.missing.includes('footballData'));
  assert.equal(preview.version,'0.1.0');
});
test('new-format backup preview counts only validated sections',()=>{
  const archive=old();archive.version='1.7.0';
  archive.data.tasksData={schema:1,tasks:[]};
  archive.data.quickListsData={schema:1,lists:[]};
  archive.data.rssData={feeds:[],articles:[]};
  const preview=previewBackup(archive,validateBackup(archive));
  assert.ok(!preview.missing.includes('tasksData'));
  assert.ok(!preview.missing.includes('quickListsData'));
  assert.equal(preview.counts.rssArticles,0);
});
test('preview cannot run on unvalidated input',()=>{
  assert.throws(()=>previewBackup({},null));
  assert.throws(()=>previewBackup(old(),{}));
});
test('invalid timestamp is not claimed as valid',()=>{
  const archive=old();archive.createdAt='<img onerror=alert(1)>';
  assert.equal(previewBackup(archive,validateBackup(archive)).createdAt,null);
});
test('existing local preferences preserve current tool arrangement',()=>{
  const settings=normaliseSettings({...DEFAULT_SETTINGS});
  assert.deepEqual(settings.toolOrder,DEFAULT_SETTINGS.toolOrder);
  assert.deepEqual(settings.hiddenTools,[]);
});
test('PWA state requires both active control and offline core resources',()=>{
  const state=pwaAssessment({supported:true,controlled:true,shellCached:true,waiting:false,onlineReported:false});
  assert.equal(state.offlineShellReady,true);
  assert.equal(state.onlineReported,false);
  assert.equal(pwaAssessment({supported:true,controlled:false,shellCached:true}).offlineShellReady,false);
  assert.equal(pwaAssessment({supported:true,controlled:true,shellCached:false}).offlineShellReady,false);
});
test('unsupported PWA cannot claim control or cached shell',()=>{
  const state=pwaAssessment({supported:false,controlled:true,shellCached:true,waiting:true});
  assert.equal(state.controlled,false);assert.equal(state.shellCached,false);assert.equal(state.waiting,false);
});
test('PWA diagnostics and Restore preview are read-only until user confirms',()=>{
  const pwa=readFileSync(new URL('../js/pwa-health.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.match(pwa,/reg\.update\(\)/);
  assert.match(pwa,/data-pwa-update/);
  assert.match(app,/previewBackup\(data,cleaned\)/);
  assert.match(app,/if\(!window\.confirm\(t\('importConfirm'\)\)\)return/);
  assert.match(app,/replaceFromBackup\(pendingBackup\)/);
});
test('backup always validates both raw and exported payload',()=>{
  const db=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
  assert.match(db,/validateBackup\(preflight\)/);
  assert.match(db,/validateBackup\(backup\)/);
  assert.match(db,/if\(!validWeatherCacheEntry\(item\)\)throw/);
});
test('new diagnostics assets are included in versioned shell',()=>{
  const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  for(const expected of ['myhub-shell-v1.7.0','js/pwa-health.js','js/pwa-health-core.js','js/backup-preview-core.js'])assert.ok(worker.includes(expected),expected);
});
