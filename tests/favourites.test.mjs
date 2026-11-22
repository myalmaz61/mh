import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {TOOLS, VERSION} from '../js/config.js';
import {emptyUnitFavourites,validUnitPair,unitPairKey,validUnitFavourites,toggleUnitFavourite} from '../js/unit-favourites-core.js';
import {validRecentTools,advanceRecentTools} from '../js/recent-core.js';
import {validateBackup} from '../js/db.js';
const a={category:'mass',from:'kg',to:'lb'};
const b={category:'temperature',from:'c',to:'f'};
const oldBackup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['calculator'],timeZones:['Europe/London']},calcHistory:[]}});
test('favourite pairs default to an empty safe structure',()=>{
  assert.deepEqual(emptyUnitFavourites(),{schema:1,pairs:[]});
  assert.equal(validUnitFavourites(emptyUnitFavourites()),true);
});
test('valid unit pairs only allow real units from same category',()=>{
  assert.ok(validUnitPair(a));assert.ok(validUnitPair(b));
  for(const pair of [{category:'mass',from:'kg',to:'km'},{category:'energy',from:'kw',to:'kwh'},{category:'mass',from:'kg',to:'kg'},{category:'__proto__',from:'a',to:'b'},null])assert.equal(validUnitPair(pair),false);
});
test('favourite pairs toggle without duplicating',()=>{
  const one=toggleUnitFavourite(emptyUnitFavourites(),a);
  assert.equal(one.pairs.length,1);
  assert.equal(unitPairKey(one.pairs[0]),unitPairKey(a));
  assert.deepEqual(toggleUnitFavourite(one,a),emptyUnitFavourites());
  assert.equal(toggleUnitFavourite(one,b).pairs.length,2);
});
test('favourite pairs reject duplicates, invalid schema and bad types',()=>{
  const one=toggleUnitFavourite(emptyUnitFavourites(),a);
  assert.equal(validUnitFavourites({...one,pairs:[a,a]}),false);
  assert.equal(validUnitFavourites({...one,schema:2}),false);
  assert.equal(validUnitFavourites({...one,pairs:'mass'}),false);
  assert.equal(validUnitFavourites({...one,pairs:[{...a,to:'javascript:alert(1)'}]}),false);
  assert.throws(()=>toggleUnitFavourite({schema:2,pairs:[]},a));
});
test('favourite limit and reversed pairs are distinct',()=>{
  const unitPairs=[];
  for(const category of ['mass','length','volume','area','speed','temperature','data']){
    const units=category==='temperature'?['c','f']:category==='mass'?['kg','lb']:category==='length'?['km','mi']:category==='volume'?['l','gal-uk']:category==='area'?['m2','ft2']:category==='speed'?['kph','mph']:['GB','GiB'];
    unitPairs.push({category,from:units[0],to:units[1]},{category,from:units[1],to:units[0]});
  }
  let stored=emptyUnitFavourites();
  for(const pair of unitPairs.slice(0,12))stored=toggleUnitFavourite(stored,pair);
  assert.equal(stored.pairs.length,12);
  assert.equal(validUnitFavourites(stored),true);
  assert.throws(()=>toggleUnitFavourite(stored,unitPairs[12]),/limit/i);
  assert.equal(toggleUnitFavourite(stored,unitPairs[0]).pairs.length,11);
});
test('recent tools validate real routes only',()=>{
  assert.ok(validRecentTools([]));assert.ok(validRecentTools(['unit','notes']));
  assert.ok(!validRecentTools(['unit','unit']));assert.ok(!validRecentTools(['fake']));assert.ok(!validRecentTools('unit'));
  assert.ok(!validRecentTools(['unit','notes','weather','timer','clock','calendar']));
});
test('recent tools update by move-to-front with five-item limit',()=>{
  let recent=[];
  for(const id of ['calculator','notes','weather','unit','calendar','tasks'])recent=advanceRecentTools(recent,id);
  assert.deepEqual(recent,['tasks','calendar','unit','weather','notes']);
  assert.deepEqual(advanceRecentTools(recent,'unit'),['unit','tasks','calendar','weather','notes']);
  assert.deepEqual(advanceRecentTools(recent,'settings'),recent);
});
test('previous archive formats restore new lists as empty',()=>{
  const data=validateBackup(oldBackup());
  assert.deepEqual(data.unitFavouritesData,emptyUnitFavourites());
  assert.deepEqual(data.recentTools,[]);
});
test('new backup lists validate and survive restore',()=>{
  const archive=oldBackup();
  archive.data.unitFavouritesData=toggleUnitFavourite(emptyUnitFavourites(),a);
  archive.data.recentTools=['unit','notes'];
  const clean=validateBackup(archive);
  assert.deepEqual(clean.unitFavouritesData.pairs[0],a);
  assert.deepEqual(clean.recentTools,['unit','notes']);
});
test('restore rejects corrupt favourites, recent history and duplicates',()=>{
  const archive=oldBackup();archive.data.unitFavouritesData={schema:1,pairs:[a]};archive.data.recentTools=['unit'];
  const corrupted=structuredClone(archive);corrupted.data.unitFavouritesData.pairs.push(a);assert.throws(()=>validateBackup(corrupted));
  const corrupted2=structuredClone(archive);corrupted2.data.recentTools.push('unit');assert.throws(()=>validateBackup(corrupted2));
  const corrupted3=structuredClone(archive);corrupted3.data.unitFavouritesData.pairs[0].to='unknown';assert.throws(()=>validateBackup(corrupted3));
});
test('v1.4 declares, bundles and keeps old modules',()=>{
  assert.equal(VERSION,'1.8.0');assert.equal(TOOLS.length,16);
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  for(const asset of ['js/unit-favourites-core.js','js/recent-core.js','js/utilities.js','js/app.js','utilities.css','myhub-shell-v1.8.0'])assert.ok(sw.includes(asset),asset);
  for(const asset of [...sw.matchAll(/'\.\/(?:js|icons)\/[^']+'|'\.\/[^']+\.css'/g)].map(x=>x[0].slice(1,-1))){assert.ok(existsSync(new URL('../'+asset.slice(2),import.meta.url)),asset);}
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.ok(app.includes('recent-tool-row'));assert.ok(app.includes("mountUnitConverter"));assert.ok(app.includes('rememberTool(route)'));
  const db=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
  for(const key of ["key:'unitFavouritesData'","key:'recentTools'", "getMeta('unitFavouritesData')", "getMeta('recentTools')"])assert.ok(db.includes(key),key);
  assert.match(db,/DB_VERSION = 1/);
});
test('new conversion UI has accessible save and remove actions',()=>{
  const source=readFileSync(new URL('../js/utilities.js',import.meta.url),'utf8');
  for(const text of ['data-unit-preset','data-unit-remove','unit-favourite-toggle','aria-pressed','saveQueue']) assert.ok(source.includes(text),text);
  assert.ok(!source.includes('localStorage.setItem'));
});
