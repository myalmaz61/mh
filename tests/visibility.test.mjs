import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {TOOLS,DEFAULT_SETTINGS,VERSION} from '../js/config.js';
import {validHiddenTools,normaliseHiddenTools,toggleToolHidden,visibleTools} from '../js/visibility-core.js';
import {normaliseSettings,validateBackup} from '../js/db.js';
import {translate} from '../js/i18n.js';
const old=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['calculator','notes'],timeZones:['Europe/London']},calcHistory:[]}});
test('fresh installations show every tool',()=>{
 assert.deepEqual(DEFAULT_SETTINGS.hiddenTools,[]);
 assert.deepEqual(normaliseSettings({}).hiddenTools,[]);
 assert.deepEqual(visibleTools(TOOLS,[]),TOOLS);
});
test('hide tools without changing inputs or deleting records',()=>{
 const original=[...TOOLS], before=TOOLS.length;
 assert.deepEqual(visibleTools(TOOLS,['notes','timer']).map(x=>x.id).includes('notes'),false);
 assert.equal(TOOLS.length,before);assert.deepEqual(original,TOOLS);
 assert.ok(TOOLS.some(x=>x.id==='notes'));
});
test('toggle hide and show preserves the rest',()=>{
 const base=['notes','timer'];
 assert.deepEqual(toggleToolHidden(base,'notes'),['timer']);
 assert.deepEqual(toggleToolHidden(base,'weather'),['notes','timer','weather']);
 assert.deepEqual(base,['notes','timer']);
});
test('all tools can be hidden but settings can restore them',()=>{
 const all=TOOLS.map(x=>x.id);
 assert.equal(validHiddenTools(all),true);
 assert.equal(visibleTools(TOOLS,all).length,0);
 assert.equal(visibleTools(TOOLS,[]).length,TOOLS.length);
});
test('reject duplicates, unknown tools and invalid preference types',()=>{
 for(const hidden of ['notes',['notes','notes'],['invalid'],[1],null,{},TOOLS.map(x=>x.id).concat('notes')])assert.equal(validHiddenTools(hidden),false);
 assert.throws(()=>toggleToolHidden(['notes','notes'],'clock'));
 assert.throws(()=>toggleToolHidden([], '__proto__'));
});
test('normalisation filters unknown IDs, duplicates and excess',()=>{
 assert.deepEqual(normaliseHiddenTools(['notes','notes','bogus','timer']),['notes','timer']);
 assert.deepEqual(normaliseHiddenTools({notes:true}),[]);
 assert.deepEqual(normaliseSettings({hiddenTools:['notes','timer','bogus']}).hiddenTools,['notes','timer']);
});
test('hidden favourites stay saved in the settings for reactivation',()=>{
 const raw={theme:'dark',language:'en',favourites:['notes','calculator'],hiddenTools:['notes'],timeZones:['Europe/London']};
 const settings=normaliseSettings(raw);
 assert.deepEqual(settings.favourites,['notes','calculator']);
 assert.deepEqual(visibleTools(settings.favourites.map(id=>TOOLS.find(x=>x.id===id)),settings.hiddenTools).map(x=>x.id),['calculator']);
 assert.deepEqual(normaliseSettings({...settings,hiddenTools:[]}).favourites,['notes','calculator']);
});
test('old JSON archives restore with all tools visible',()=>{
 const data=validateBackup(old());
 assert.deepEqual(data.settings.hiddenTools,[]);
 assert.deepEqual(data.settings.favourites,['calculator','notes']);
});
test('new archives retain hidden tools and personal entries',()=>{
 const data=old();data.data.settings.hiddenTools=['calendar','timer'];
 const clean=validateBackup(data);
 assert.deepEqual(clean.settings.hiddenTools,['calendar','timer']);
 assert.deepEqual(clean.settings.favourites,['calculator','notes']);
});
test('invalid hidden preferences cause backup validation to fail',()=>{
 for(const hiddenTools of [['calendar','calendar'],['fake'],['__proto__'],[],true,{},null]){
   if(Array.isArray(hiddenTools)&&!hiddenTools.length)continue;
   const archive=old();archive.data.settings.hiddenTools=hiddenTools;
   assert.throws(()=>validateBackup(archive),undefined,JSON.stringify(hiddenTools));
 }
});
test('existing personal data survives hidden preferences in backup',()=>{
 const archive=old();archive.data.settings.hiddenTools=['notes'];
 archive.data.notes=[{id:'n1',kind:'text',title:'Private',body:'Saved',items:[],pinned:false,favourite:true,createdAt:'2026-11-19T12:00:00.000Z',updatedAt:'2026-11-19T12:00:00.000Z'}];
 assert.equal(validateBackup(archive).notes[0].body,'Saved');
});
test('English and Bulgarian settings labels are present',()=>{
 for(const lang of ['bg','en']){
   const t=translate(lang);
   for(const key of ['manageTools','hiddenCount','hiddenToolsHint','showAllTools','allToolsHidden']) assert.notEqual(t(key),key);
 }
});
test('UI uses visibility rules on home, list and search',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 for(const code of ['visibleTools(TOOLS,settings.hiddenTools)','toggleToolHidden(settings.hiddenTools,id)',"data-tool-visible",'shown.map(tile)',"settings.hiddenTools.includes(tool.id)",'#show-all-tools'])assert.ok(app.includes(code),code);
});
test('offline precache includes new visibility code, old tools and bumped version',()=>{
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.equal(VERSION,'1.9.0'); assert.ok(sw.includes('myhub-shell-v1.9.0'));
 for(const asset of ['js/visibility-core.js','js/recent-core.js','js/notes.js','js/tasks.js','js/rss.js','js/share-target.js','js/quick-add.js'])assert.ok(sw.includes(asset),asset);
 assert.ok(existsSync(new URL('../js/visibility-core.js',import.meta.url)));
});
