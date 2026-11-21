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
    rows.push(entry('note',note.id,note.title||'—',body,note.updatedAt,'notes'));
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
export function findInIndex(index, query, category='all', max=50){
  const q=norm(query).slice(0,120);
  if(!q) return {total:0, results:[], counts:Object.fromEntries(SEARCH_CATEGORIES.map(k=>[k,0]))};
  const terms=q.split(/\s+/u).filter(Boolean).slice(0,12);
  const matched=(Array.isArray(index)?index:[]).filter(row=>row&&typeof row.haystack==='string'&&terms.every(term=>row.haystack.includes(term)));
  const counts=Object.fromEntries(SEARCH_CATEGORIES.map(k=>[k,k==='all'?matched.length:matched.filter(row=>row.kind===k).length]));
  const selected=category==='all'?matched:matched.filter(row=>row.kind===category);
  const ranked=selected.map((row,index)=>({row,index,score:norm(row.title).startsWith(q)?3:norm(row.title).includes(q)?2:1}));
  ranked.sort((a,b)=>b.score-a.score || (b.row.updatedAt||'').localeCompare(a.row.updatedAt||'') || a.index-b.index);
  return {total:selected.length,counts,results:ranked.slice(0,Math.max(0,Math.min(100,Math.trunc(max)||50))).map(x=>x.row)};
}
