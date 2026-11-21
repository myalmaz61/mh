import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseQuantity,UNIT_GROUPS,convertUnits,readableNumber} from '../js/unit-core.js';
import {parseIsoDay,daysBetween,addDays,weekdaysBetween} from '../js/date-core.js';
import {calculatePercent} from '../js/percent-core.js';
import {emptyBookmarks,normaliseLink,validBookmarks} from '../js/bookmarks-core.js';
import {validateBackup} from '../js/db.js';
import {VERSION,TOOLS} from '../js/config.js';

const goodItem={id:'a',title:'MyHub website',url:'https://example.com/',category:'Tools',favourite:true,createdAt:'2026-11-20T10:00:00.000Z',updatedAt:'2026-11-20T10:00:00.000Z'};
const backup=()=>({app:'MyHub',format:1,createdAt:'2026-11-20T10:00:00.000Z',data:{notes:[],settings:{theme:'light',language:'bg',favourites:['calculator'],timeZones:['Europe/Sofia']},calcHistory:[]}});
test('unit categories have unique identifiers and positive factors',()=>{
  assert.equal(Object.keys(UNIT_GROUPS).length,7);
  for(const group of Object.values(UNIT_GROUPS)){
    assert.ok(group.units.length>=3);
    assert.equal(new Set(group.units.map(u=>u[0])).size,group.units.length);
    assert.ok(group.units.every(u=>typeof u[1]==='string'&&u[2]&&u[3]>0));
  }
});
test('length, mass, volume, speed and data convert accurately',()=>{
  assert.equal(convertUnits('length','mi','km',1),1.609344);
  assert.equal(convertUnits('mass','kg','g',1),1000);
  assert.equal(convertUnits('volume','gal-uk','l',1),4.54609);
  assert.equal(convertUnits('area','ha','m2',2),20000);
  assert.ok(Math.abs(convertUnits('speed','mph','kph',60)-96.56064)<1e-8);
  assert.equal(convertUnits('data','MiB','B',1),1048576);
});
test('temperature conversion keeps Celsius/Fahrenheit/Kelvin and absolute zero',()=>{
  assert.equal(convertUnits('temperature','c','f',0),32);
  assert.equal(convertUnits('temperature','f','c',212),100);
  assert.equal(convertUnits('temperature','k','c',273.15),0);
  assert.throws(()=>convertUnits('temperature','k','f',-1));
});
test('quantities allow decimal comma but reject injection and overflows',()=>{
  assert.equal(parseQuantity('12,75'),12.75);
  assert.equal(parseQuantity(' -0.25 '),-0.25);
  for(const value of ['1+2','Infinity','1e100','',{},'NaN'])assert.throws(()=>parseQuantity(value));
  assert.throws(()=>convertUnits('volume','l','not-a-unit',1));
  assert.equal(readableNumber(2.5,'en'),'2.5');
});
test('date math crosses daylight saving without off-by-one',()=>{
  assert.equal(daysBetween('2026-03-28','2026-03-30'),2);
  assert.equal(daysBetween('2026-10-24','2026-10-26'),2);
  assert.equal(daysBetween('2026-11-20','2026-11-18'),-2);
  assert.equal(addDays('2024-02-28',1),'2024-02-29');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.equal(addDays('2026-01-01',-1),'2025-12-31');
});
test('date math validates impossible dates and out-of-range offsets',()=>{
  for(const date of ['2026-02-29','2026-13-01','2026-00-01','2026-2-01','1899-01-01'])assert.throws(()=>parseIsoDay(date));
  assert.throws(()=>addDays('2026-11-20',100001));
  assert.throws(()=>addDays('2100-12-31',1));
});
test('weekday difference ignores weekends but not bank holidays',()=>{
  assert.equal(weekdaysBetween('2026-11-20','2026-11-23'),1);
  assert.equal(weekdaysBetween('2026-11-23','2026-11-30'),5);
  assert.equal(weekdaysBetween('2026-11-30','2026-11-23'),-5);
});
test('percentage operations calculate typical café figures',()=>{
  assert.equal(calculatePercent('of','10','200'),20);
  assert.equal(calculatePercent('what','20','200'),10);
  assert.equal(calculatePercent('change','100','120'),20);
  assert.equal(calculatePercent('change','100','80'),-20);
  assert.equal(calculatePercent('increase','100','10'),110.00000000000001); // floating point representation
  assert.equal(calculatePercent('decrease','100','10'),90);
  assert.equal(calculatePercent('vatAdd','100','20'),120);
  assert.equal(calculatePercent('vatRemove','120','20'),100);
});
test('percentage math avoids divide by zero and invalid values',()=>{
  assert.throws(()=>calculatePercent('what',10,0));
  assert.throws(()=>calculatePercent('change',0,10));
  assert.throws(()=>calculatePercent('vatAdd',10,-5));
  assert.throws(()=>calculatePercent('vatRemove',10,150));
  assert.throws(()=>calculatePercent('hacked',1,2));
});
test('bookmarks validate URLs, schema, unique IDs and duplicate addresses',()=>{
  assert.ok(validBookmarks(emptyBookmarks()));
  assert.equal(normaliseLink(' https://EXAMPLE.com '),'https://example.com/');
  assert.throws(()=>normaliseLink('javascript:alert(1)'));
  assert.throws(()=>normaliseLink('https://user:pass@example.com'));
  assert.throws(()=>normaliseLink('file:///etc/passwd'));
  const valid={schema:1,items:[goodItem]};assert.ok(validBookmarks(valid));
  assert.equal(validBookmarks({...valid,items:[goodItem,{...goodItem,id:'b'}]}),false);
  assert.equal(validBookmarks({...valid,items:[goodItem,{...goodItem,url:'https://other.org/'}]}),false);
  assert.equal(validBookmarks({...valid,items:[{...goodItem,url:'javascript:alert(1)'}]}),false);
});
test('backup restores older files and validates new bookmark section',()=>{
  assert.deepEqual(validateBackup(backup()).bookmarksData,emptyBookmarks());
  const b=backup();b.data.bookmarksData={schema:1,items:[goodItem]};
  assert.equal(validateBackup(b).bookmarksData.items[0].title,'MyHub website');
  const bad=structuredClone(b);bad.data.bookmarksData.items[0].url='javascript:alert(1)';assert.throws(()=>validateBackup(bad));
  const malformed=structuredClone(b);malformed.data.bookmarksData.items[0].favourite='true';assert.throws(()=>validateBackup(malformed));
});
test('new routes, translation, worker and local database remain integrated',()=>{
  assert.equal(VERSION,'1.2.0');
  for(const id of ['unit','datecalc','percentage','bookmarks'])assert.ok(TOOLS.some(x=>x.id===id));
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const db=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
  assert.match(db,/DB_VERSION = 1/);
  for(const path of ['js/utilities.js','js/bookmarks.js','js/unit-core.js','js/date-core.js','js/percent-core.js','js/bookmarks-core.js','utilities.css'])assert.ok(sw.includes(path),path);
  for(const id of ['unit','datecalc','percentage','bookmarks'])assert.ok(app.includes(`route==='${id}'`),id);
  assert.ok(db.includes("key:'bookmarksData'"));
  const i18n=readFileSync(new URL('../js/i18n.js',import.meta.url),'utf8');assert.ok(i18n.includes("unitConverter:'Конвертор'"));
});
