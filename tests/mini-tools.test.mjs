import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {countText,MAX_TEXT_LENGTH} from '../js/text-counter-core.js';
import {randomNumbers,uniformIndex,parseChoices,pickChoice,MAX_VALUE,MIN_VALUE} from '../js/random-core.js';
import {validateBackup, normaliseSettings} from '../js/db.js';
import {VERSION,TOOLS} from '../js/config.js';
import {translate} from '../js/i18n.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

// Unicode and privacy-safe text statistics
test('Text counter handles an empty value',()=>{
  assert.deepEqual(countText(''),{words:0,characters:0,withoutSpaces:0,lines:0,paragraphs:0,bytes:0,minutes:0});
});
test('Bulgarian, Turkish and Latin words are counted',()=>{
  const value='Здравей свят! Hello dünya.\nİstanbul и София';
  const result=countText(value);
  assert.equal(result.words,7);
  assert.equal(result.lines,2);
  assert.equal(result.paragraphs,1);
  assert.equal(result.minutes,1);
});
test('Emoji and combining marks are counted as graphemes in modern browsers',()=>{
  assert.equal(countText('a\u0301 🙂 👩‍👩‍👧‍👦').characters,5);
  assert.equal(countText('a\u0301 🙂 👩‍👩‍👧‍👦').withoutSpaces,3);
});
test('Blank lines form paragraphs; CRLF is normalized',()=>{
  const result=countText('Line 1\r\nLine 2\r\n\r\nLine 3\r\n');
  assert.equal(result.lines,5);
  assert.equal(result.paragraphs,2);
  assert.equal(result.words,6);
});
test('Whitespace, no-space counts and UTF-8 bytes stay consistent',()=>{
  const result=countText('A Б\n');
  assert.equal(result.characters,4);
  assert.equal(result.withoutSpaces,2);
  assert.equal(result.bytes,5);
});
test('Text is bounded and invalid arguments are rejected',()=>{
  assert.equal(countText('x'.repeat(MAX_TEXT_LENGTH)).characters,MAX_TEXT_LENGTH);
  assert.throws(()=>countText('x'.repeat(MAX_TEXT_LENGTH+1)));
  assert.throws(()=>countText(null));
});
// RNG rejection sampling, validation, and unbiased sampling without replacement
test('Uniform index excludes biased overflow values',()=>{
  const numbers=[4294967295,3];
  assert.equal(uniformIndex(3,()=>numbers.shift()),0);
  assert.equal(numbers.length,0);
});
test('Uniform index rejects illegal arguments',()=>{
  for(const size of [0,-1,1.5,4294967297,Infinity])assert.throws(()=>uniformIndex(size,()=>0));
  assert.throws(()=>uniformIndex(2,()=>-1));
});
test('Random numbers respect inclusive endpoints',()=>{
  assert.deepEqual(randomNumbers({min:-100,max:-99,count:2,unique:false},()=>1),[-99,-99]);
  assert.deepEqual(randomNumbers({min:4,max:4,count:3,unique:false}),[4,4,4]);
});
test('Without replacement returns requested number of distinct values',()=>{
  const items=randomNumbers({min:1,max:5,count:5,unique:true},()=>0);
  assert.equal(items.length,5);
  assert.equal(new Set(items).size,5);
  assert.deepEqual([...items].sort((a,b)=>a-b),[1,2,3,4,5]);
});
test('Valid negative-to-positive and max safe UI ranges are supported',()=>{
  const sample=randomNumbers({min:MIN_VALUE,max:MAX_VALUE,count:50,unique:true},()=>0);
  assert.equal(sample.length,50);
  assert.equal(new Set(sample).size,50);
  assert.ok(sample.every(i=>i>=MIN_VALUE&&i<=MAX_VALUE));
});
test('Invalid numbers, counts and unique requests are rejected',()=>{
  for(const input of [
    {min:3,max:2},{min:1,max:5,count:0},{min:1,max:5,count:51},
    {min:1.5,max:5},{min:-1000000001,max:5},{min:1,max:1000000001},
    {min:1,max:2,count:3,unique:true},{min:1,max:2,count:2,unique:'yes'}
  ])assert.throws(()=>randomNumbers(input,()=>0));
});
test('Choice picker removes duplicate lines and ignores blanks',()=>{
  assert.deepEqual(parseChoices('Coffee\n\nTea\nCoffee\nWater'),['Coffee','Tea','Water']);
  assert.equal(pickChoice('Sofia\nLondon\n',()=>1),'London');
});
test('Choice picker rejects one option, excessive options or overlong text',()=>{
  assert.throws(()=>parseChoices('Only option'));
  assert.throws(()=>parseChoices('a\n'.repeat(10000)));
  assert.throws(()=>parseChoices('x'.repeat(201)+'\ny'));
});
test('Both new tools are registered, translated and pre-cached for offline use',()=>{
  assert.equal(VERSION,'2.4.0');
  for(const id of ['textcounter','random']) assert.ok(TOOLS.some(t=>t.id===id));
  const worker=source('sw.js');
  for(const asset of ['./js/text-counter-core.js','./js/text-counter.js','./js/random-core.js','./js/random-generator.js','./mini-tools.css'])assert.ok(worker.includes(asset));
  assert.ok(worker.includes('myhub-shell-v2.4.0'));
  assert.ok(source('index.html').includes('mini-tools.css'));
  for(const term of ['textCounter','textCounterDesc','randomGenerator','randomGeneratorDesc']){
    assert.notEqual(translate('bg')(term),term);
    assert.notEqual(translate('en')(term),term);
  }
  assert.ok(source('js/app.js').includes("route==='textcounter'"));
  assert.ok(source('js/app.js').includes("route==='random'"));
});
test('Existing favourites and older backups remain accepted without migration',()=>{
  const original={app:'MyHub',format:1,createdAt:'2026-11-20T08:00:00Z',data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['calculator','notes'],timeZones:['Europe/London']},calcHistory:[]}};
  const snapshot=validateBackup(original);
  assert.deepEqual(snapshot.settings.favourites,['calculator','notes']);
  assert.deepEqual(normaliseSettings({...snapshot.settings,favourites:['random','textcounter','notes']}).favourites,['random','textcounter','notes']);
  assert.ok(source('js/db.js').includes('const DB_VERSION = 1'));
});
test('New text and random results are not stored in IndexedDB',()=>{
  for(const term of ['countText','randomNumbers','pickChoice'])assert.ok(!source('js/db.js').includes(term));
  assert.ok(!source('js/text-counter.js').includes('setMeta('));
  assert.ok(!source('js/random-generator.js').includes('setMeta('));
});
