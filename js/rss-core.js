/* Pure RSS model helpers. Feed content is always treated as untrusted text. */
export const MAX_RSS_FEEDS = 40;
export const MAX_RSS_ARTICLES = 1600;
export const MAX_RSS_ITEMS_PER_FEED = 100;
const iso = value => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));
const plain = (value,max) => typeof value === 'string' && value.length <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const emptyRssData = () => ({feeds:[],articles:[]});
export function safeUrl(value,base='') {
  if(typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value.trim(),base||undefined);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname && !['localhost'].includes(url.hostname.toLowerCase()) ? url.href : '';
  } catch { return ''; }
}
export function hashString(str) {
  let n = 2166136261;
  for(let i=0;i<str.length;i++){n^=str.charCodeAt(i);n=Math.imul(n,16777619);}
  return (n>>>0).toString(36);
}
export function validRssData(value){
  if(!object(value)||!Array.isArray(value.feeds)||!Array.isArray(value.articles)||value.feeds.length>MAX_RSS_FEEDS||value.articles.length>MAX_RSS_ARTICLES)return false;
  const feeds=new Set();const urls=new Set();const ids=new Set();
  for(const f of value.feeds){
    if(!object(f)||!plain(f.id,90)||!f.id||feeds.has(f.id)||!plain(f.url,2048)||safeUrl(f.url)!==f.url||urls.has(f.url)||!plain(f.title,140)||!f.title.trim()||!plain(f.category,60)||!f.category.trim()||!iso(f.addedAt)||!(f.checkedAt===''||iso(f.checkedAt)))return false;
    feeds.add(f.id);urls.add(f.url);
  }
  for(const a of value.articles){
    if(!object(a)||!plain(a.id,160)||!a.id||ids.has(a.id)||!feeds.has(a.feedId)||!plain(a.title,350)||!a.title.trim()||!plain(a.url,2048)||!(a.url===''||safeUrl(a.url)===a.url)||!plain(a.summary,1500)||!(a.publishedAt===''||iso(a.publishedAt))||!iso(a.addedAt)||typeof a.read!=='boolean'||typeof a.starred!=='boolean'||typeof a.later!=='boolean')return false;
    ids.add(a.id);
  }
  return true;
}
export function compactRssArticles(articles){
  const unique=new Map();for(const a of articles){if(!unique.has(a.id))unique.set(a.id,a);}
  const list=[...unique.values()].sort((a,b)=>Date.parse(b.publishedAt||b.addedAt)-Date.parse(a.publishedAt||a.addedAt));
  // Never discard saved stories just because a feed refreshed. Flagged items have priority.
  const flagged=list.filter(a=>a.starred||a.later);
  const remaining=list.filter(a=>!a.starred&&!a.later);
  return [...flagged.slice(0,MAX_RSS_ARTICLES),...remaining.slice(0,Math.max(0,MAX_RSS_ARTICLES-flagged.length))];
}
export function mergeRssFeed(existing,feed,items,when=new Date().toISOString()){
  const prevById=new Map(existing.articles.map(a=>[a.id,a]));
  const newArticles=items.slice(0,MAX_RSS_ITEMS_PER_FEED).map(a=>{
    const prev=prevById.get(a.id);
    return {...a,feedId:feed.id,addedAt:prev?.addedAt||when,read:prev?.read||false,starred:prev?.starred||false,later:prev?.later||false};
  });
  const feeds=existing.feeds.map(f=>f.id===feed.id?{...f,checkedAt:when,title:(f.title===f.url&&feed.title)?feed.title:f.title}:f);
  const combined=[...newArticles,...existing.articles.filter(a=>a.feedId!==feed.id||!newArticles.some(b=>b.id===a.id))];
  const articles=compactRssArticles(combined);
  return {feeds,articles};
}
export function xmlEscape(value){return String(value).replace(/[<>&"']/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));}
export function exportOpml(feeds){
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>MyHub RSS</title></head><body>\n${feeds.map(f=>`<outline type="rss" text="${xmlEscape(f.title)}" title="${xmlEscape(f.title)}" xmlUrl="${xmlEscape(f.url)}" category="${xmlEscape(f.category)}"/>`).join('\n')}\n</body></opml>`;
}
export function readXml(text){
  if(typeof text!=='string'||text.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Invalid XML (size / DTD)');
  if(typeof DOMParser==='undefined')throw Error('XML parser unavailable');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror'))throw Error('Invalid XML document');
  return doc;
}
function child(node,name){return [...node.children].find(n=>n.localName.toLowerCase()===name.toLowerCase())||null;}
function childText(node,name){return child(node,name)?.textContent?.trim()||'';}
function published(value){if(!value||Number.isNaN(Date.parse(value)))return '';return new Date(value).toISOString();}
function plainText(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function shortText(value,max){return plainText(value).slice(0,max);}
export function parseFeedXml(text,feed){
  const doc=readXml(text);
  const root=doc.documentElement;
  const tag=root?.localName?.toLowerCase();
  const channel=tag==='rss'?child(root,'channel'):(tag==='rdf'?root:null);
  const atom=tag==='feed';
  if(!channel&&!atom)throw Error('RSS 2.0 / Atom feed expected');
  const nodes=[...(atom?root.children:channel.children)].filter(n=>n.localName.toLowerCase()===(atom?'entry':'item'));
  const title=shortText(childText(atom?root:channel,'title'),140)||feed.title;
  const items=[]; const unique=new Set();
  for(const node of nodes.slice(0,250)){
    const isAtom=atom;
    let link='';
    if(isAtom){
      const links=[...node.children].filter(n=>n.localName==='link');
      link=links.find(n=>!n.getAttribute('rel')||n.getAttribute('rel')==='alternate')?.getAttribute('href')||'';
    }else link=childText(node,'link');
    const url=safeUrl(link,feed.url);
    const rawId=childText(node,isAtom?'id':'guid')||url||childText(node,'title');
    const itemTitle=shortText(childText(node,'title'),350);
    if(!itemTitle||!rawId)continue;
    const id=`${feed.id}:${hashString(rawId)}`;
    if(unique.has(id))continue;unique.add(id);
    const rawSummary=childText(node,isAtom?'summary':'description')||childText(node,'content')||'';
    const date=published(childText(node,isAtom?'updated':'pubDate')||childText(node,'published')||childText(node,'date'));
    items.push({id,feedId:feed.id,title:itemTitle,url,summary:shortText(rawSummary,1500),publishedAt:date});
    if(items.length>=MAX_RSS_ITEMS_PER_FEED)break;
  }
  return {title,items};
}
export function parseOpml(text){
  const doc=readXml(text); if(doc.documentElement?.localName?.toLowerCase()!=='opml')throw Error('OPML expected');
  const found=[];const urls=new Set();
  for(const item of doc.querySelectorAll('outline[xmlUrl]')){
    const url=safeUrl(item.getAttribute('xmlUrl')||'');
    if(!url||urls.has(url))continue;
    urls.add(url);
    found.push({url,title:shortText(item.getAttribute('title')||item.getAttribute('text')||url,140)||url,
      category:shortText(item.getAttribute('category')||item.parentElement?.getAttribute('text')||'General',60)||'General'});
    if(found.length>=500)break;
  }
  return found;
}
