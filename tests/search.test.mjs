import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSearchIndex,findInIndex,SEARCH_CATEGORIES} from '../js/search-core.js';
import {VERSION} from '../js/config.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fixture=()=>({
  notes:[{id:'n1',title:'Покупки за кафенето',body:'Мляко и кафе',updatedAt:'2026-11-21T10:00:00Z',items:[]},
    {id:'n2',title:'Задачи за пътуване',body:'',items:[{text:'Билети София'},{text:'Паспорт'}]}],
  tasks:[{id:'t1',title:'Плати доставката',details:'петък следобед',due:'2026-11-27',updatedAt:'2026-11-20T08:00:00Z'},
    {id:'t2',title:'Завършена задача',details:'Проверка',done:true}],
  events:[{id:'e1',title:'Зъболекар',details:'Среща сутрин',date:'2026-11-23',time:'11:30'}],
  lists:[{id:'q1',name:'Списък за пазар',items:[{text:'Банани'},{text:'Картофи'}]}],
  bookmarks:[{id:'b1',title:'GitHub',category:'Работа',url:'https://github.com'}],
  tools:[{id:'calculator',title:'Калкулатор',description:'Сметки и проценти'}]
});
test('index includes five local record types plus tool shortcuts',()=>{
  const rows=makeSearchIndex(fixture());
  assert.equal(rows.length,8);
  assert.deepEqual(new Set(rows.map(r=>r.kind)),new Set(['note','task','event','list','bookmark','tool']));
  assert.equal(rows.find(x=>x.id==='q1').route,'quicklist');
});
test('Bulgarian query and case-insensitive matching finds notes',()=>{
  const rows=makeSearchIndex(fixture());
  assert.equal(findInIndex(rows,'КАФЕНЕ').results[0].id,'n1');
  assert.equal(findInIndex(rows,'  кафе  ').results[0].id,'n1');
});
test('checklist items and note checklist items are indexed',()=>{
  const rows=makeSearchIndex(fixture());
  assert.equal(findInIndex(rows,'паспорт').results[0].id,'n2');
  assert.equal(findInIndex(rows,'банани').results[0].id,'q1');
});
test('tasks, events and links are searchable by details, date and URL',()=>{
  const rows=makeSearchIndex(fixture());
  assert.equal(findInIndex(rows,'петък').results[0].id,'t1');
  assert.equal(findInIndex(rows,'2026-11-23').results[0].id,'e1');
  assert.equal(findInIndex(rows,'github.com').results[0].id,'b1');
});
test('completed tasks are indexed too, no hidden filter',()=>{
  const rows=makeSearchIndex(fixture());
  assert.equal(findInIndex(rows,'завършена').results[0].id,'t2');
});
test('multiple query words must all match, even in different fields',()=>{
  const rows=makeSearchIndex(fixture());
  assert.equal(findInIndex(rows,'Плати петък').results[0].id,'t1');
  assert.equal(findInIndex(rows,'Плати Банани').total,0);
});
test('category filters and counts report all matches without leaks',()=>{
  const rows=makeSearchIndex(fixture());
  assert.equal(findInIndex(rows,'за').counts.note,2);
  assert.equal(findInIndex(rows,'за','note').total,2);
  assert.equal(findInIndex(rows,'за','bookmark').total,0);
  assert.deepEqual(SEARCH_CATEGORIES,['all','note','task','event','list','bookmark','tool']);
});
test('exact title match scores above body-only matches',()=>{
  const rows=makeSearchIndex({notes:[
    {id:'a',title:'Other',body:'тест',items:[]},
    {id:'b',title:'Тест задача',body:'',items:[]} ]});
  assert.equal(findInIndex(rows,'тест').results[0].id,'b');
});
test('query limit, result cap and empty search protect big collections',()=>{
  const notes=Array.from({length:160},(_,i)=>({id:'n'+i,title:'общо '+i,body:'',items:[]}));
  const rows=makeSearchIndex({notes});
  assert.equal(findInIndex(rows,'').total,0);
  const data=findInIndex(rows,'общо','all',50);
  assert.equal(data.total,160);assert.equal(data.results.length,50);
  assert.equal(findInIndex(rows,'общо','all',500).results.length,100);
});
test('invalid records are ignored and the supplied arrays are never mutated',()=>{
  const input=fixture(), snapshot=JSON.stringify(input);
  input.notes.push({id:8,title:'broken'});
  const saved=JSON.stringify(input);
  const rows=makeSearchIndex(input);findInIndex(rows,'покупки');
  assert.equal(rows.length,8);assert.equal(JSON.stringify(input),saved);
  assert.notEqual(saved,snapshot);
});
test('indexing HTML-like titles remains raw data, all UI markup must escape them',()=>{
  const rows=makeSearchIndex({notes:[{id:'x',title:'<img src=x onerror=alert(1)>',body:'<script>bad</script>',items:[]}]});
  assert.equal(rows[0].title,'<img src=x onerror=alert(1)>');
  const search=read('js/search.js');
  assert.match(search,/escapeHtml\(row\.title\)/);
  assert.match(search,/escapeHtml\(row\.summary\)/);
  assert.match(search,/getNotes\(\)/);
  assert.doesNotMatch(search,/setMeta\(|putNote\(|deleteNote\(/);
});
test('v1.0 search integrates with route, local-first data and offline cache',()=>{
  assert.equal(VERSION,'2.2.0');
  const app=read('js/app.js'),index=read('index.html'),sw=read('sw.js'),db=read('js/db.js');
  assert.match(app,/route==='search'/);
  assert.match(app,/home-universal-search/);
  for(const s of ['notes','tasks','calendar','quicklist','bookmarks'])assert.match(app,new RegExp(`route==='${s}'`));
  for(const asset of ['search.css','js/search.js','js/search-core.js'])assert.ok(sw.includes(asset));
  assert.match(index,/search\.css/);
  assert.match(db,/const DB_VERSION = 1;/);
  assert.doesNotMatch(db,/searchData|searchHistory/);
});
test('deep links select the exact original record without creating copies',()=>{
  for(const file of ['notes','tasks','quick-list','calendar','bookmarks']){
    const source=read('js/'+file+'.js');
    assert.ok(source.includes('initialId'),file);
  }
});
