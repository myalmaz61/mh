import {getMeta,setMeta} from './db.js';
import {escapeHtml} from './utils.js';
import {emptyRssData,validRssData,MAX_RSS_FEEDS,mergeRssFeed,parseFeedXml,parseOpml,exportOpml,safeUrl,hashString} from './rss-core.js';

const esc=escapeHtml;
const asDate=(value,lang)=>value?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value)):'';
const asDateTime=(value,lang)=>value?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'';
function download(content,name,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),6000);
}
function titleFromUrl(url){try{return new URL(url).hostname.replace(/^www\./,'').slice(0,140);}catch{return url.slice(0,140);}}

export async function mountRss({element,t,lang,notify,confirmAction=window.confirm}){
  let data=await getMeta('rssData');
  if(data===undefined)data=emptyRssData();
  if(!validRssData(data)){
    element.innerHTML=`<section class="tool-head"><h1>${t('rss')}</h1></section><section class="surface"><p class="warning-text">${t('rssCorrupt')}</p></section>`;
    return ()=>{};
  }
  let dead=false,busy=false,activeFeed='all',tab='all',category='all',search='',status='',controller=null,queue=Promise.resolve();
  element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB · RSS</span><h1>📰 ${t('rss')}</h1><p>${t('rssIntro')}</p></section>
    <section class="surface rss-toolbar"><div class="row-between rss-heading"><h2>${t('rssSources')}</h2><span class="soft-tag" id="rss-sources-count"></span></div>
      <div class="rss-actions"><button type="button" class="primary-btn" id="rss-refresh">↻ ${t('weatherRefresh')}</button><button type="button" class="secondary-btn" id="rss-toggle-add">＋ ${t('rssAdd')}</button></div>
      <p class="muted rss-status" id="rss-status" aria-live="polite"></p><div class="rss-feeds" id="rss-feeds"></div>
      <form id="rss-add-form" class="rss-subform" hidden><h3>${t('rssAdd')}</h3>
        <label for="rss-feed-url">${t('rssAddress')}</label><input class="text-field" id="rss-feed-url" type="url" required placeholder="https://example.org/feed.xml" inputmode="url" maxlength="2048">
        <label for="rss-feed-title">${t('rssFeedName')}</label><input class="text-field" id="rss-feed-title" maxlength="140" placeholder="${t('rssOptional')}">
        <label for="rss-feed-category">${t('rssCategory')}</label><input class="text-field" id="rss-feed-category" maxlength="60" value="General">
        <button type="submit" class="primary-btn">${t('rssSaveSource')}</button></form>
    </section>
    <section class="surface rss-article-section"><div class="row-between rss-heading"><h2>${t('rssArticles')}</h2><span id="rss-unread-count" class="soft-tag"></span></div>
      <div class="rss-control-row"><label class="sr-only" for="rss-feed-filter">${t('rssSources')}</label><select id="rss-feed-filter" class="input-select"></select>
      <label class="sr-only" for="rss-category-filter">${t('rssCategory')}</label><select id="rss-category-filter" class="input-select"></select></div>
      <label class="sr-only" for="rss-search">${t('rssSearch')}</label><input id="rss-search" type="search" class="text-field" placeholder="${t('rssSearch')}">
      <div class="rss-tabs" role="group" aria-label="${t('rssFilter')}">
        <button type="button" data-rss-tab="all">${t('footballAll')}</button><button type="button" data-rss-tab="unread">${t('rssUnread')}</button>
        <button type="button" data-rss-tab="starred">★ ${t('rssStarred')}</button><button type="button" data-rss-tab="later">↗ ${t('rssReadLater')}</button></div>
      <div id="rss-articles" aria-live="polite"></div></section>
    <section class="surface rss-import"><h2>${t('rssImportExport')}</h2><p class="muted">${t('rssImportHint')}</p>
      <div class="rss-actions"><button type="button" id="rss-opml-export" class="secondary-btn">↓ ${t('rssExportOpml')}</button>
        <button type="button" id="rss-opml-import" class="secondary-btn">↑ ${t('rssImportOpml')}</button>
        <button type="button" id="rss-xml-import" class="secondary-btn">↑ ${t('rssImportXml')}</button>
        <button type="button" id="rss-public-cache" class="secondary-btn">↻ ${t('rssPublicCache')}</button></div>
      <input type="file" id="rss-opml-file" accept=".opml,.xml,text/xml,application/xml" hidden>
      <input type="file" id="rss-xml-file" accept=".xml,.rss,.atom,text/xml,application/xml" hidden>
      <p class="muted rss-cors-note">${t('rssCORS')}</p></section>`;
  const el=sel=>element.querySelector(sel);
  const message=(str)=>{status=str;el('#rss-status').textContent=status;};
  const persist=async(next)=>{
    if(!validRssData(next))throw Error('Invalid RSS data');
    const previous=data;data=next;paint();
    try{
      const snapshot=structuredClone(next);
      queue=queue.catch(()=>{}).then(()=>setMeta('rssData',snapshot));await queue;
    }catch(err){data=previous;paint();notify(t('rssSaveError'));throw err;}
  };
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(err){console.warn(err);message(`${t('rssError')}: ${err.message||''}`);}};
  function paintFeeds(){
    el('#rss-sources-count').textContent=String(data.feeds.length);
    el('#rss-feeds').innerHTML=data.feeds.length?data.feeds.map(f=>{
      const count=data.articles.filter(a=>a.feedId===f.id&&!a.read).length;
      return `<div class="rss-source"><div><strong>${esc(f.title)}</strong><small>${esc(f.category)} · ${count} ${t('rssUnreadShort')} ${f.checkedAt?' · '+esc(asDateTime(f.checkedAt,lang)):''}</small></div>
        <button type="button" class="rss-remove" data-rss-delete="${esc(f.id)}" aria-label="${t('rssRemove')} ${esc(f.title)}">×</button></div>`;
    }).join(''):`<p class="muted">${t('rssNoFeeds')}</p>`;
    const all=el('#rss-feed-filter');
    const selected=data.feeds.some(f=>f.id===activeFeed)?activeFeed:'all';activeFeed=selected;
    all.innerHTML=`<option value="all">${t('rssAllSources')}</option>`+data.feeds.map(f=>`<option value="${esc(f.id)}">${esc(f.title)}</option>`).join('');all.value=selected;
    const categories=[...new Set(data.feeds.map(f=>f.category))].sort((a,b)=>a.localeCompare(b));
    if(category!=='all'&&!categories.includes(category))category='all';
    const cat=el('#rss-category-filter');cat.innerHTML=`<option value="all">${t('rssAllCategories')}</option>`+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');cat.value=category;
    el('#rss-refresh').disabled=busy||!navigator.onLine||data.feeds.length===0;
    el('#rss-refresh').textContent=busy?t('weatherLoading'):`↻ ${t('weatherRefresh')}`;
  }
  function paintArticles(){
    const unread=data.articles.filter(a=>!a.read).length;
    el('#rss-unread-count').textContent=`${unread} ${t('rssUnreadShort')}`;
    const feedMap=new Map(data.feeds.map(f=>[f.id,f]));
    let list=data.articles.filter(a=>{
      const f=feedMap.get(a.feedId);if(!f)return false;
      if(activeFeed!=='all'&&a.feedId!==activeFeed)return false;
      if(category!=='all'&&f.category!==category)return false;
      if(tab==='unread'&&a.read)return false;
      if(tab==='starred'&&!a.starred)return false;
      if(tab==='later'&&!a.later)return false;
      if(search&&!`${a.title} ${a.summary} ${f.title}`.toLocaleLowerCase().includes(search))return false;
      return true;
    }).sort((a,b)=>Date.parse(b.publishedAt||b.addedAt)-Date.parse(a.publishedAt||a.addedAt)).slice(0,250);
    el('#rss-articles').innerHTML=list.length?list.map(a=>{
      const f=feedMap.get(a.feedId);
      return `<article class="rss-article ${a.read?'rss-is-read':''}"><div class="rss-article-meta"><span>${esc(f.title)}</span><span>${esc(asDate(a.publishedAt||a.addedAt,lang))}</span></div>
        <h3>${esc(a.title)}</h3>${a.summary?`<p>${esc(a.summary)}</p>`:''}
        <div class="rss-article-actions">
          ${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" data-rss-open="${esc(a.id)}">${t('rssOpenArticle')} ↗</a>`:''}
          <button type="button" data-rss-mark="${esc(a.id)}" aria-label="${a.read?t('rssMarkUnread'):t('rssMarkRead')}">${a.read?'○':'✓'} ${a.read?t('rssMarkUnread'):t('rssMarkRead')}</button>
          <button type="button" data-rss-star="${esc(a.id)}" aria-pressed="${a.starred}">${a.starred?'★':'☆'} ${t('rssStarred')}</button>
          <button type="button" data-rss-later="${esc(a.id)}" aria-pressed="${a.later}">${a.later?'▣':'□'} ${t('rssReadLater')}</button></div></article>`;
    }).join(''):`<p class="muted rss-empty">${t('rssEmptyArticles')}</p>`;
    element.querySelectorAll('[data-rss-tab]').forEach(btn=>{btn.classList.toggle('selected',tab===btn.dataset.rssTab);btn.setAttribute('aria-pressed',String(tab===btn.dataset.rssTab));});
  }
  function paint(){if(dead)return;paintFeeds();paintArticles();}
  async function addFeed(url,name,group){
    const clean=safeUrl(url);if(!clean)throw Error(t('rssInvalidUrl'));
    if(data.feeds.some(f=>f.url===clean))throw Error(t('rssDuplicate'));
    if(data.feeds.length>=MAX_RSS_FEEDS)throw Error(t('rssFeedLimit'));
    const title=(name||titleFromUrl(clean)).trim().slice(0,140);
    const category=(group||'General').trim().slice(0,60);
    if(!title||!category)throw Error(t('rssInvalidUrl'));
    const newFeed={id:`f-${crypto.randomUUID()}`,url:clean,title,category,addedAt:new Date().toISOString(),checkedAt:''};
    await persist({...data,feeds:[...data.feeds,newFeed]});
    return newFeed;
  }
  async function readLimited(response,cap){
    if(Number(response.headers.get('content-length')||0)>cap)throw Error('Feed is too large');
    if(!response.body?.getReader){const str=await response.text();if(str.length>cap)throw Error('Feed is too large');return str;}
    const reader=response.body.getReader(),decoder=new TextDecoder();let result='',length=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>cap)throw Error('Feed is too large');result+=decoder.decode(value,{stream:true});}return result+decoder.decode();}
    finally{reader.releaseLock();}
  }
  async function refreshFeed(feed){
    const current=data.feeds.find(f=>f.id===feed.id);if(!current)return;
    const response=await fetch(feed.url,{signal:controller.signal,cache:'no-store',redirect:'follow',credentials:'omit',headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'}});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    // Streaming size cap prevents storing massive feeds; Content-Length may be absent.
    const content=await readLimited(response,2_000_000);
    const parsed=parseFeedXml(content,feed);
    await persist(mergeRssFeed(data,feed,parsed.items));
  }
  async function refresh(){
    if(busy||dead)return;if(!navigator.onLine){message(t('rssOffline'));return;}
    const list=activeFeed==='all'?data.feeds.slice(0,10):data.feeds.filter(f=>f.id===activeFeed);
    if(!list.length){message(t('rssNoFeeds'));return;}
    busy=true;controller=new AbortController();paint();
    let done=0,failed=0;const timer=setTimeout(()=>controller.abort(),30000);
    try{
      for(const feed of list){if(dead)break;
        message(`${t('rssRefreshing')}: ${feed.title} (${done+failed+1}/${list.length})`);
        try{await refreshFeed(feed);done++;}catch(err){failed++;console.warn('RSS refresh',feed.url,err);}
      }
      message(`${t('rssRefreshSummary')}: ${done} · ${t('rssFailed')}: ${failed}${failed?' · '+t('rssCORSShort'):''}`);
    }finally{clearTimeout(timer);controller=null;busy=false;paint();}
  }
  async function loadManualXml(file){
    if(!file||file.size>2_000_000)throw Error('XML exceeds 2 MB');
    const feed=data.feeds.find(f=>f.id===activeFeed);
    if(!feed)throw Error(t('rssChooseSource'));
    const parsed=parseFeedXml(await file.text(),feed);
    await persist(mergeRssFeed(data,feed,parsed.items));
    message(`${t('rssImported')}: ${parsed.items.length} · ${feed.title}`);
  }
  async function loadPublicCache(){
    if(!navigator.onLine){message(t('rssOffline'));return;}
    const res=await fetch(new URL('./rss-public-cache.json',location.href),{cache:'no-store'});
    if(!res.ok)throw Error(t('rssCacheMissing'));
    if(Number(res.headers.get('content-length')||0)>4_000_000)throw Error('Cache too big');
    const txt=await res.text();if(txt.length>4_000_000)throw Error('Cache too big');
    const payload=JSON.parse(txt);
    if(!payload||payload.format!==1||!Array.isArray(payload.feeds)||payload.feeds.length>40)throw Error(t('rssInvalidCache'));
    let next=data,updated=0;
    const generatedAt=typeof payload.generatedAt==='string'&&Number.isFinite(Date.parse(payload.generatedAt))?new Date(payload.generatedAt).toISOString():new Date().toISOString();
    for(const item of payload.feeds){
      if(!item||typeof item.url!=='string'||!Array.isArray(item.articles)||item.articles.length>100)continue;
      const f=next.feeds.find(feed=>feed.url===item.url);if(!f)continue;
      const cleaned=item.articles.map(a=>{
        const href=safeUrl(a.url||'',f.url);
        const title=String(a.title||'').trim().slice(0,350);
        const key=String(a.guid||href||title).slice(0,2048);
        const date=a.publishedAt&&Number.isFinite(Date.parse(a.publishedAt))?new Date(a.publishedAt).toISOString():'';
        return title&&key?{id:`${f.id}:${hashString(key)}`,feedId:f.id,title,url:href,
          summary:String(a.summary||'').replace(/<[^>]*>/g,' ').slice(0,1500),publishedAt:date}:null;
      }).filter(Boolean);
      next=mergeRssFeed(next,f,cleaned,generatedAt);updated++;
    }
    if(!updated)throw Error(t('rssCacheNoMatch'));
    await persist(next);message(`${t('rssImported')}: ${updated} ${t('rssSources')} · ${t('rssCacheDate')}: ${asDateTime(generatedAt,lang)}`);
  }
  // Static listeners, no raw content event handlers.
  el('#rss-toggle-add').addEventListener('click',()=>{const form=el('#rss-add-form');form.hidden=!form.hidden;if(!form.hidden)el('#rss-feed-url').focus();});
  el('#rss-add-form').addEventListener('submit',safe(async ev=>{
    ev.preventDefault();const url=el('#rss-feed-url').value;
    const feed=await addFeed(url,el('#rss-feed-title').value,el('#rss-feed-category').value);
    el('#rss-add-form').reset();el('#rss-add-form').hidden=true;message(`${t('rssSaved')}: ${feed.title}`);
  }));
  el('#rss-refresh').addEventListener('click',safe(refresh));
  el('#rss-feeds').addEventListener('click',safe(async ev=>{
    const id=ev.target.closest('[data-rss-delete]')?.dataset.rssDelete;if(!id)return;
    const feed=data.feeds.find(f=>f.id===id);if(!feed||!confirmAction(`${t('rssDeleteConfirm')} ${feed.title}?`))return;
    await persist({feeds:data.feeds.filter(f=>f.id!==id),articles:data.articles.filter(a=>a.feedId!==id)});
  }));
  el('#rss-feed-filter').addEventListener('change',e=>{activeFeed=e.target.value;paintArticles();});
  el('#rss-category-filter').addEventListener('change',e=>{category=e.target.value;paintArticles();});
  el('#rss-search').addEventListener('input',e=>{search=e.target.value.trim().toLocaleLowerCase();paintArticles();});
  element.querySelectorAll('[data-rss-tab]').forEach(btn=>btn.addEventListener('click',()=>{tab=btn.dataset.rssTab;paintArticles();}));
  el('#rss-articles').addEventListener('click',safe(async ev=>{
    const btn=ev.target.closest('[data-rss-mark],[data-rss-star],[data-rss-later],[data-rss-open]');if(!btn)return;
    const id=btn.dataset.rssMark||btn.dataset.rssStar||btn.dataset.rssLater||btn.dataset.rssOpen;
    const item=data.articles.find(a=>a.id===id);if(!item)return;
    const field=btn.hasAttribute('data-rss-mark')||btn.hasAttribute('data-rss-open')?'read':btn.hasAttribute('data-rss-star')?'starred':'later';
    const value=btn.hasAttribute('data-rss-open')?true:!item[field];
    await persist({...data,articles:data.articles.map(a=>a.id===id?{...a,[field]:value}:a)});
  }));
  el('#rss-opml-export').addEventListener('click',()=>download(exportOpml(data.feeds),'MyHub-feeds.opml','text/xml;charset=utf-8'));
  el('#rss-opml-import').addEventListener('click',()=>el('#rss-opml-file').click());
  el('#rss-opml-file').addEventListener('change',safe(async ev=>{
    const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
    if(file.size>2_000_000)throw Error('OPML exceeds 2 MB');
    const rows=parseOpml(await file.text());let count=0;
    // Atomic merge: validates all records before a single local write.
    const existing=new Set(data.feeds.map(f=>f.url));const more=[];
    for(const f of rows){if(existing.has(f.url))continue;if(data.feeds.length+more.length>=MAX_RSS_FEEDS)break;
      existing.add(f.url);more.push({id:`f-${crypto.randomUUID()}`,url:f.url,title:f.title,category:f.category,addedAt:new Date().toISOString(),checkedAt:''});count++;}
    if(more.length)await persist({...data,feeds:[...data.feeds,...more]});
    message(`${t('rssImported')}: ${count} ${t('rssSources')}`);
  }));
  el('#rss-xml-import').addEventListener('click',()=>{
    if(activeFeed==='all'){message(t('rssChooseSource'));return;}el('#rss-xml-file').click();
  });
  el('#rss-xml-file').addEventListener('change',safe(async ev=>{
    const file=ev.target.files?.[0];ev.target.value='';if(file)await loadManualXml(file);
  }));
  el('#rss-public-cache').addEventListener('click',safe(loadPublicCache));
  paint();if(!navigator.onLine)message(t('rssOffline'));
  return ()=>{dead=true;controller?.abort();};
}
