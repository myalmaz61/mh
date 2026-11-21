import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseSharedLink,buildSharedBookmark} from '../js/share-core.js';
import {validBookmarks,normaliseLink} from '../js/bookmarks-core.js';
import {validateBackup,createBackup} from '../js/db.js';
import {VERSION} from '../js/config.js';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

// Realistic Android share examples, including the documented empty `url` field.
test('Android shared text URL is recognised when url field is empty',()=>{
  assert.deepEqual(parseSharedLink({title:'News article',text:'Read this: https://example.org/story?id=9',url:''}),{
    title:'News article',url:'https://example.org/story?id=9',category:'',favourite:false
  });
});
test('Uses URL field first and supports share with URL only',()=>{
  assert.equal(parseSharedLink({title:'Article',text:'https://wrong.example',url:'https://right.example/path'}).url,'https://right.example/path');
  assert.equal(parseSharedLink({text:'https://example.org'}).title,'example.org');
  assert.equal(parseSharedLink({title:'https://EXAMPLE.ORG/foo'}).url,'https://example.org/foo');
});
test('Strips trailing punctuation from text and preserves a query string',()=>{
  const result=parseSharedLink({text:'Read: https://example.com/article?first=1&second=2).'});
  assert.equal(result.url,'https://example.com/article?first=1&second=2');
});
test('Rejects unsafe, invalid and credential-containing links',()=>{
  for(const str of ['javascript:alert(1)','data:text/html,hi','file:///local/path','https://u:p@example.com','not a link', 'mailto:user@example.com']){
    assert.equal(parseSharedLink({text:str}),null,str);
  }
  assert.throws(()=>buildSharedBookmark({url:'javascript:alert(1)',title:'Unsafe'},{id:'id'}));
});
test('Builds record compatible with existing Bookmarks storage and backup',()=>{
  const item=buildSharedBookmark({url:'https://example.com/path',title:' Example ',category:' Work ',favourite:true},{id:'id123',now:'2026-11-21T21:00:00.000Z'});
  assert.equal(item.title,'Example');assert.equal(item.category,'Work');
  assert.equal(item.favourite,true);
  assert.equal(validBookmarks({schema:1,items:[item]}),true);
  const backup={app:'MyHub',format:1,createdAt:'2026-11-21T21:00:00.000Z',data:{
    notes:[],settings:{theme:'auto',language:'bg',favourites:['bookmarks'],timeZones:[]},calcHistory:[],
    bookmarksData:{schema:1,items:[item]}
  }};
  assert.equal(validateBackup(backup).bookmarksData.items[0].url,item.url);
});
test('Rejects too long titles, categories, and URLs',()=>{
  for(const values of [
    {url:'https://example.com',title:'x'.repeat(161)},
    {url:'https://example.com',title:'Nice',category:'x'.repeat(61)},
    {url:'https://example.com/'+'a'.repeat(2050),title:'Nice'},
  ])assert.throws(()=>buildSharedBookmark(values,{id:'valid-id'}));
});
test('PWA manifest registers an installed POST target scoped to the app',()=>{
  const manifest=JSON.parse(file('manifest.webmanifest'));
  assert.equal(manifest.id,'./');assert.equal(manifest.scope,'./');
  assert.deepEqual(manifest.share_target,{action:'./share.html',method:'POST',enctype:'multipart/form-data',params:{title:'title',text:'text',url:'url'}});
  assert.equal(VERSION,'1.3.0');
});
test('Landing page and CSS use semantic labels and no external SDK',()=>{
  const html=file('share.html');const js=file('js/share-target.js');
  assert.match(html,/id="share-form"/);assert.match(html,/js\/share-target\.js/);
  assert.match(js,/appendSharedBookmark/);assert.match(js,/receiptKey/);
  assert.match(js,/window\.history\.replaceState/);
  assert.doesNotMatch(js,/innerHTML/);
  assert.doesNotMatch(html,/<script[^>]+src="https?:/);
});
test('IndexedDB remains v1 and shared saves are one atomic readwrite transaction',()=>{
  const db=file('js/db.js');
  assert.match(db,/const DB_VERSION = 1;/);
  assert.match(db,/export async function appendSharedBookmark/);
  assert.match(db,/db\.transaction\('meta','readwrite'\)/);
  assert.match(db,/!validBookmarks\(existing\)/);
  assert.match(db,/existing\.items\.find\(x=>x\.url===item\.url\)/);
  assert.match(db,/store\.put\(\{key:'bookmarksData'/);
  assert.doesNotMatch(db,/db\.createObjectStore\('share/);
});
test('Existing app accepts id-only routing without passing URLs in query',()=>{
  const app=file('js/app.js');
  assert.match(app,/myhubOpen/);assert.match(app,/requested==='bookmarks'/);
  assert.match(app,/window\.history\.replaceState/);
  assert.doesNotMatch(app,/sharedUrl|sharedText/);
});
test('Service worker caches all new offline resources and separates share page',()=>{
  const sw=file('sw.js');
  for(const name of ['myhub-shell-v1.3.0','./share.html','./share.css','./js/share-target.js','./js/share-core.js','request.formData()','SHARE_INBOX'])assert.ok(sw.includes(name),name);
  assert.match(sw,/const isShare=url\.pathname===sharePage\.pathname/);
  assert.match(sw,/Response\.redirect\(dest\.href,303\)/);
});
test('Actual SW POST handler stores shared data locally and never calls fetch',async()=>{
  const url='https://example.test/myhub/';
  const handlers={};let networkCalls=0;
  const database=new Map();
  const cache={
    async put(key,value){database.set(String(key),value.clone());},
    async match(key){const v=database.get(String(key));return v?.clone();},
    async delete(key){return database.delete(String(key));},
    async addAll(){},
  };
  const cachesMock={async open(){return cache;},async match(key){return cache.match(key);},async keys(){return [];},async delete(){return true;}};
  const self={registration:{scope:url},location:{origin:'https://example.test'},clients:{async claim(){}},addEventListener(name,fn){handlers[name]=fn;}};
  const fakeCrypto={randomUUID(){return '00000000-0000-4000-a000-000000000001';}};
  vm.runInNewContext(file('sw.js'),{self,caches:cachesMock,Request,Response,URL,FormData,console,fetch:async()=>{networkCalls++;throw Error('Network must not be accessed');},crypto:fakeCrypto});
  const data=new FormData();data.set('title','A private article');data.set('text','https://example.org/private?token=secret');data.set('url','');
  const req=new Request(url+'share.html',{method:'POST',body:data});
  let promise;
  handlers.fetch({request:req,respondWith(value){promise=Promise.resolve(value);}});
  assert.ok(promise,'POST must be intercepted');
  const response=await promise;
  assert.equal(response.status,303);
  const location=response.headers.get('location');
  assert.match(location,/shareId=00000000-0000-4000-a000-000000000001/);
  assert.doesNotMatch(location,/private|secret|example\.org/);
  assert.equal(networkCalls,0);
  assert.deepEqual(JSON.parse(await (await cache.match(location)).text()),{
    title:'A private article',text:'https://example.org/private?token=secret',url:''
  });
});
