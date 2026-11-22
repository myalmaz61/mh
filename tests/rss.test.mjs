import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VERSION,TOOLS} from '../js/config.js';
import {emptyRssData,validRssData,safeUrl,hashString,mergeRssFeed,compactRssArticles,exportOpml,MAX_RSS_ARTICLES} from '../js/rss-core.js';
import {validateBackup} from '../js/db.js';
import {translate} from '../js/i18n.js';
const now='2026-11-20T13:00:00.000Z';
const feed={id:'f-1234',url:'https://example.org/feed.xml',title:'Example',category:'News',addedAt:now,checkedAt:''};
const article={id:'f-1234:article1',feedId:feed.id,title:'A real article',url:'https://example.org/story',summary:'Info',publishedAt:now,addedAt:now,read:false,starred:false,later:false};
const emptyOldBackup=()=>({app:'MyHub',format:1,data:{notes:[],settings:{theme:'auto',language:'bg',favourites:['calculator'],timeZones:['Europe/Sofia']},calcHistory:[]}});

test('RSS core starts clean and validates empty and populated data',()=>{
  assert.deepEqual(emptyRssData(),{feeds:[],articles:[]});
  assert.ok(validRssData(emptyRssData()));
  assert.ok(validRssData({feeds:[feed],articles:[article]}));
});
test('RSS URLs reject javascript, non-TLS, credentials, local host, malicious schemes',()=>{
  for(const bad of ['javascript:alert(1)','http://example.org/feed','file:///etc/passwd','https://user:pass@example.org/feed','https://localhost/feed','data:hi','']) assert.equal(safeUrl(bad),'',bad);
  assert.equal(safeUrl('/story','https://example.org/feed'),'https://example.org/story');
  assert.equal(safeUrl('https://example.org/feed'),'https://example.org/feed');
});
test('RSS backup rejects corrupt, duplicate and orphaned records',()=>{
  const a={feeds:[feed],articles:[article]};
  assert.equal(validRssData({...a,feeds:[feed,feed]}),false);
  assert.equal(validRssData({...a,articles:[article,article]}),false);
  assert.equal(validRssData({...a,articles:[{...article,feedId:'unknown'}]}),false);
  assert.equal(validRssData({...a,articles:[{...article,url:'javascript:alert(1)'}]}),false);
  assert.equal(validRssData({...a,articles:[{...article,read:'true'}]}),false);
  assert.equal(validRssData({...a,feeds:[{...feed,checkedAt:'yesterday'}]}),false);
});
test('refresh preserves read, star and Read Later flags',()=>{
  const stored={feeds:[feed],articles:[{...article,read:true,starred:true,later:true}]};
  const refreshed=mergeRssFeed(stored,feed,[{...article,title:'Updated title'}],now);
  assert.equal(refreshed.articles.length,1);
  assert.equal(refreshed.articles[0].title,'Updated title');
  assert.deepEqual([refreshed.articles[0].read,refreshed.articles[0].starred,refreshed.articles[0].later],[true,true,true]);
  assert.equal(refreshed.feeds[0].checkedAt,now);
});
test('pruning prioritizes items marked starred or read later',()=>{
  const list=Array.from({length:MAX_RSS_ARTICLES+5},(_,i)=>({...article,id:'key'+i,starred:i===0,publishedAt:new Date(Date.parse(now)+i*1000).toISOString()}));
  const result=compactRssArticles(list);
  assert.equal(result.length,MAX_RSS_ARTICLES);
  assert.ok(result.some(a=>a.id==='key0'));
});
test('OPML export escapes XML and does not include private article or history data',()=>{
  const xml=exportOpml([{...feed,title:'News & <Friends> "Best"'}]);
  assert.ok(xml.includes('News &amp; &lt;Friends&gt; &quot;Best&quot;'));
  assert.ok(xml.includes('xmlUrl="https://example.org/feed.xml"'));
  assert.ok(!xml.includes(article.summary));
});
test('v0.1–v0.6 JSON backups remain accepted, RSS defaults empty',()=>{
  assert.deepEqual(validateBackup(emptyOldBackup()).rssData,emptyRssData());
  const valid=emptyOldBackup();valid.data.rssData={feeds:[feed],articles:[article]};
  assert.equal(validateBackup(valid).rssData.articles[0].title,'A real article');
  const bad=emptyOldBackup();bad.data.rssData={feeds:[feed],articles:[{...article,url:'javascript:alert(1)'}]};
  assert.throws(()=>validateBackup(bad),/RSS/);
});
test('v0.7 integration and translations exist without changing IndexedDB version',()=>{
  assert.equal(VERSION,'2.1.0');assert.ok(TOOLS.some(item=>item.id==='rss'));
  for(const f of ['js/rss.js','js/rss-core.js','rss.css']){
    assert.ok(readFileSync(new URL('../sw.js',import.meta.url),'utf8').includes(f));
  }
  const db=readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
  assert.match(db,/DB_VERSION = 1/);assert.ok(db.includes("rssData"));
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.ok(app.includes('mountRss'));
  for(const key of ['rss','rssDesc','rssCorrupt','rssImportXml','rssImportOpml','rssReadLater','rssCORS','rssPublicCache']) {
    assert.notEqual(translate('bg')(key),key);assert.notEqual(translate('en')(key),key);
  }
});
test('stable article ID hash is deterministic',()=>{
  assert.equal(hashString('abc'),hashString('abc'));
  assert.notEqual(hashString('abc'),hashString('abcd'));
});
