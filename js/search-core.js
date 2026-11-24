/** Read-only, in-memory global search. Never persists or changes records. */
export const SEARCH_CATEGORIES = Object.freeze(['all','note','task','event','list','bookmark','tool']);
const safeText = v => typeof v === 'string' ? v : '';
const norm = v => safeText(v).normalize('NFKC').toLocaleLowerCase().trim();
const limit = (v, length) => safeText(v).slice(0,length);
const validRecord = v => v && typeof v === 'object' && typeof v.id === 'string' && v.id.length > 0;
function entry(kind,id,title,body,updatedAt,route,extra='') {
  const text = safeText(body);
  return { kind, id, route, title:limit(title,200), body:text,
    summary:limit(text.replace(/\s+/g,' ').trim(),160), updatedAt:safeText(updatedAt),
    haystack:norm([title,body,extra].join(' ')) };
}
/** Expects validated container objects. Ignores invalid individual records defensively. */
export function makeSearchIndex({notes=[],tasks=[],events=[],lists=[],bookmarks=[],tools=[]}={}) {
  const rows=[];
  for(const note of notes) {
    if(!validRecord(note) || typeof note.title !== 'string' || typeof note.body !== 'string' || !Array.isArray(note.items)) continue;
    const body=[note.body,...note.items.filter(item=>item&&typeof item.text==='string').map(item=>item.text)].join(' ');
    rows.push(entry('note',note.id,note.title||'—',body,note.updatedAt,'notes',typeof note.category==='string'?note.category:''));
  }
  for(const task of tasks) {
    if(!validRecord(task) || typeof task.title!=='string') continue;
    rows.push(entry('task',task.id,task.title,safeText(task.details),task.updatedAt,'tasks',task.due));
  }
  for(const event of events) {
    if(!validRecord(event) || typeof event.title!=='string') continue;
    rows.push(entry('event',event.id,event.title,[event.date,event.time,event.details].filter(Boolean).join(' · '),event.updatedAt,'calendar'));
  }
  for(const list of lists) {
    if(!validRecord(list) || typeof list.name!=='string' || !Array.isArray(list.items)) continue;
    rows.push(entry('list',list.id,list.name,list.items.filter(item=>item&&typeof item.text==='string').map(item=>item.text).join(' · '),list.updatedAt,'quicklist'));
  }
  for(const bookmark of bookmarks) {
    if(!validRecord(bookmark) || typeof bookmark.title!=='string')continue;
    rows.push(entry('bookmark',bookmark.id,bookmark.title,[bookmark.category,bookmark.url].filter(Boolean).join(' · '),bookmark.updatedAt,'bookmarks'));
  }
  for(const tool of tools){
    if(!validRecord(tool)||typeof tool.title!=='string')continue;
    rows.push(entry('tool',tool.id,tool.title,safeText(tool.description),'',tool.id,tool.id));
  }
  return rows;
}
/** Space separated words must all match; results sorted by title relevance and recency. */
export function findInIndex(index, query, category='all', max=50, options={}){
  const q=norm(query).slice(0,120);
  if(!q) return {total:0, results:[], counts:Object.fromEntries(SEARCH_CATEGORIES.map(k=>[k,0]))};
  const terms=q.split(/\s+/u).filter(Boolean).slice(0,12);
  const titlesOnly=options?.titlesOnly===true;
  const matched=(Array.isArray(index)?index:[]).filter(row=>row&&typeof row.haystack==='string'&&terms.every(term=>(titlesOnly?norm(row.title):row.haystack).includes(term)));
  const counts=Object.fromEntries(SEARCH_CATEGORIES.map(k=>[k,k==='all'?matched.length:matched.filter(row=>row.kind===k).length]));
  const selected=category==='all'?matched:matched.filter(row=>row.kind===category);
  const ranked=selected.map((row,index)=>({row,index,score:norm(row.title).startsWith(q)?3:norm(row.title).includes(q)?2:1}));
  const newestFirst=options?.sort==='newest';
  const timestamp=value=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return -Infinity;
    const parsed=Date.parse(value);
    return Number.isFinite(parsed)?parsed:-Infinity;
  };
  ranked.sort((a,b)=>{
    if(newestFirst){
      const aTime=timestamp(a.row.updatedAt),bTime=timestamp(b.row.updatedAt);
      return (aTime===bTime?0:bTime>aTime?1:-1) || b.score-a.score || a.index-b.index;
    }
    return b.score-a.score || (b.row.updatedAt||'').localeCompare(a.row.updatedAt||'') || a.index-b.index;
  });
  return {total:selected.length,counts,results:ranked.slice(0,Math.max(0,Math.min(100,Math.trunc(max)||50))).map(x=>x.row)};
}

/** Return a short excerpt near a matching query word instead of the start of a long note.
 * Matches in titles or indexed-only extras retain the original preview.
 * No markup or user data is written anywhere. The UI must HTML-escape this.
 */
export function matchExcerpt(row, query, maxLength=160) {
  if(!row||typeof row.body!=='string')return '';
  const fallback=typeof row.summary==='string'?row.summary:'';
  const clean=row.body.replace(/\s+/gu,' ').trim();
  if(!clean)return fallback;
  const max=Number.isFinite(maxLength)?Math.max(40,Math.min(200,Math.trunc(maxLength))):160;
  const terms=String(query??'').trim().slice(0,120).split(/\s+/u).filter(Boolean).slice(0,12);
  if(!terms.length)return fallback;
  const lower=clean.toLocaleLowerCase();
  // Prioritise first present term in the body; preserve result ordering.
  const indices=terms.map(term=>lower.indexOf(term.toLocaleLowerCase())).filter(i=>i>=0);
  if(!indices.length)return fallback;
  const first=Math.min(...indices);
  if(clean.length<=max)return clean;
  let start=Math.max(0,first-40);
  if(start>0){const wordBoundary=clean.lastIndexOf(' ',start);if(wordBoundary>0&&start-wordBoundary<15)start=wordBoundary+1;}
  const end=Math.min(clean.length,start+max);
  return `${start>0?'…':''}${clean.slice(start,end).trim()}${end<clean.length?'…':''}`;
}

/** Split visible text into literal segments for safe highlighting.
 * No HTML is produced here. The caller MUST escape each segment before rendering.
 * Offset mapping keeps highlights aligned even for NFKC characters (e.g. fullwidth).
 */
export function highlightParts(text, query, maxMatches=48) {
  const original=safeText(text);
  const terms=[...new Set(norm(query).slice(0,120).split(/\s+/u).filter(Boolean).slice(0,12))];
  if(!original||!terms.length)return [{text:original,matched:false}];
  let normalized='';
  const spans=[];
  for(let offset=0;offset<original.length;){
    const char=String.fromCodePoint(original.codePointAt(offset));
    const folded=char.normalize('NFKC').toLocaleLowerCase();
    normalized+=folded;
    for(let i=0;i<folded.length;i++)spans.push({start:offset,end:offset+char.length});
    offset+=char.length;
  }
  const ranges=[];
  for(const term of terms){
    let pos=0;
    while(pos<normalized.length&&ranges.length<maxMatches){
      const index=normalized.indexOf(term,pos);
      if(index<0)break;
      const a=spans[index],b=spans[index+term.length-1];
      if(a&&b)ranges.push([a.start,b.end]);
      pos=index+Math.max(1,term.length);
    }
  }
  if(!ranges.length)return [{text:original,matched:false}];
  ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const merged=[];
  for(const [start,end] of ranges){
    const last=merged.at(-1);
    if(last&&start<=last[1])last[1]=Math.max(last[1],end);
    else merged.push([start,end]);
  }
  const parts=[];let pos=0;
  for(const [start,end] of merged){
    if(start>pos)parts.push({text:original.slice(pos,start),matched:false});
    parts.push({text:original.slice(start,end),matched:true});
    pos=end;
  }
  if(pos<original.length)parts.push({text:original.slice(pos),matched:false});
  return parts;
}
