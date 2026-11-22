import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VERSION, TOOLS, DEFAULT_SETTINGS } from '../js/config.js';
import { DEFAULT_TOOL_ORDER, validToolOrder, normaliseToolOrder, moveToolOrder, orderedTools } from '../js/tool-order-core.js';
import { visibleTools } from '../js/visibility-core.js';
import { normaliseSettings, validateBackup } from '../js/db.js';
import { translate } from '../js/i18n.js';

const ids=TOOLS.map(tool=>tool.id);
const oldBackup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'dark',language:'bg',favourites:['notes','calculator'],hiddenTools:['notes'],timeZones:['Europe/London']},calcHistory:[]}});

test('default order matches existing All Tools order',()=>{
  assert.equal(VERSION,'1.6.0');
  assert.deepEqual([...DEFAULT_TOOL_ORDER],ids);
  assert.deepEqual(DEFAULT_SETTINGS.toolOrder,ids);
  assert.deepEqual(normaliseSettings({}).toolOrder,ids);
  assert.notStrictEqual(normaliseSettings({}).toolOrder,DEFAULT_SETTINGS.toolOrder);
});
test('tool order must contain exactly each known tool once',()=>{
  assert.equal(validToolOrder(ids),true);
  for(const value of [undefined,null,{},'calculator',[],['calculator'],[...ids,'bogus'],[...ids.slice(1),'clock'],[...ids.slice(0,-1),'__proto__'],[...ids.slice(0,-1),12]]){
    assert.equal(validToolOrder(value),false,JSON.stringify(value));
  }
});
test('up and down movement changes one step but not input',()=>{
  const before=[...ids];
  const next=moveToolOrder(before,'notes','up');
  assert.equal(next.indexOf('notes'),before.indexOf('notes')-1);
  assert.deepEqual(before,ids);
  assert.deepEqual(moveToolOrder(next,'notes','down'),ids);
});
test('boundaries do not wrap',()=>{
  assert.deepEqual(moveToolOrder(ids,ids[0],'up'),ids);
  assert.deepEqual(moveToolOrder(ids,ids.at(-1),'down'),ids);
});
test('invalid operation never alters the passed order',()=>{
  const before=[...ids];
  assert.throws(()=>moveToolOrder(ids,'unknown','up'));
  assert.throws(()=>moveToolOrder(ids,'calculator','left'));
  assert.throws(()=>moveToolOrder(['calculator','notes'],'calculator','down'));
  assert.deepEqual(before,ids);
});
test('normalisation repairs corrupt local preferences without losing tools',()=>{
  const repaired=normaliseToolOrder(['notes','notes','invalid',null,'clock']);
  assert.deepEqual(repaired.slice(0,2),['notes','clock']);
  assert.equal(repaired.length,ids.length);
  assert.deepEqual(new Set(repaired),new Set(ids));
  assert.deepEqual(normaliseToolOrder({}),ids);
});
test('All Tools respects custom order and hidden tools',()=>{
  const next=moveToolOrder(ids,'notes','up');
  assert.equal(orderedTools(TOOLS,next)[1].id,'notes');
  const shown=visibleTools(orderedTools(TOOLS,next),['notes']);
  assert.equal(shown.find(tool=>tool.id==='notes'),undefined);
  assert.equal(shown[1].id,'clock');
  assert.equal(orderedTools(TOOLS,next)[1].id,'notes');
});
test('favourite order remains independent of All Tools order',()=>{
  const settings=normaliseSettings({favourites:['notes','calculator'],toolOrder:['weather',...ids.filter(id=>id!=='weather')]});
  assert.deepEqual(settings.favourites,['notes','calculator']);
  assert.equal(settings.toolOrder[0],'weather');
  assert.equal(settings.hiddenTools.length,0);
});
test('older archive without toolOrder restores existing preferences and default order',()=>{
  const parsed=validateBackup(oldBackup());
  assert.deepEqual(parsed.settings.toolOrder,ids);
  assert.deepEqual(parsed.settings.favourites,['notes','calculator']);
  assert.deepEqual(parsed.settings.hiddenTools,['notes']);
});
test('new archive persists order and personal records',()=>{
  const archive=oldBackup();
  archive.data.settings.toolOrder=moveToolOrder(ids,'notes','up');
  const validated=validateBackup(archive);
  assert.deepEqual(validated.settings.toolOrder,archive.data.settings.toolOrder);
  assert.deepEqual(validated.settings.hiddenTools,['notes']);
});
test('invalid toolOrder in backup is rejected before restore',()=>{
  for(const value of [null,{},[],['notes','calculator'],[...ids.slice(1),'notes'],[...ids.slice(0,-1),'random-id']]){
    const archive=oldBackup();archive.data.settings.toolOrder=value;
    assert.throws(()=>validateBackup(archive),undefined,JSON.stringify(value));
  }
});
test('restore default order does not alter hidden and favourite settings',()=>{
  const custom=normaliseSettings({favourites:['notes','calculator'],hiddenTools:['timer'],toolOrder:[...ids].reverse()});
  const restored=normaliseSettings({...custom,toolOrder:[...DEFAULT_TOOL_ORDER]});
  assert.deepEqual(restored.toolOrder,ids);
  assert.deepEqual(restored.favourites,custom.favourites);
  assert.deepEqual(restored.hiddenTools,custom.hiddenTools);
});
test('Bulgarian and English labels are provided',()=>{
  for(const lang of ['bg','en']){
    const tr=translate(lang);
    for(const key of ['sortAllTools','sortAllToolsHint','resetToolOrder','hiddenLabel'])assert.notEqual(tr(key),key);
  }
});
test('App renders sorted All Tools and independent manage section',()=>{
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  for(const needle of ['visibleTools(orderedTools(TOOLS,settings.toolOrder),settings.hiddenTools)',"id=\"tool-order\"",'data-tool-order','moveToolOrder(settings.toolOrder,id,direction)',"id=\"reset-tool-order\"",'order.map(settingsToolRow)'])assert.ok(app.includes(needle),needle);
});
test('Offline cache, versions, and JS modules present',()=>{
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.ok(sw.includes('myhub-shell-v1.6.0'));
  assert.ok(sw.includes('js/tool-order-core.js'));
  assert.ok(existsSync(new URL('../js/tool-order-core.js',import.meta.url)));
  assert.ok(sw.includes('./js/visibility-core.js'));
});
