/** Pure, non-mutating list organisation for Notes. Pins remain first in every order.
 * v6.3: build transient search/sort metadata once per list view, not on every
 * Android keypress. The index contains no persistence and never changes notes.
 */
import {categoryName} from './notes-category-core.js';

const EMPTY = Object.freeze([]);
const validNote = note => note && typeof note.title === 'string' &&
  typeof note.body === 'string' && Array.isArray(note.items);
const updatedTime = note => {
  const parsed=Date.parse(note.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Construct a snapshot for ONE rendered Notes view. Recreate after any edit.
 * `.select` memoises the last exact filter/sort combination for Show more.
 * Indexed text is deliberately not persisted or included in JSON Backup.
 */
export function createNotesSelector(notes) {
  const entries=Array.isArray(notes) ? notes.filter(validNote).map(note=>{
    const category=categoryName(note.category);
    return {
      note,
      categoryLower:category.toLocaleLowerCase(),
      searchText:null, // lazy: don't normalise long bodies until actually searched
      time:updatedTime(note)
    };
  }) : EMPTY;
  let lastKey=null;
  let lastResults=null;
  const select=({query='',scope='all',order='newest',locale='bg-BG',category='*'}={})=>{
    const text=String(query).trim().toLocaleLowerCase();
    const selectedScope=['all','pinned','favourites'].includes(scope)?scope:'all';
    const selectedOrder=['newest','oldest','title'].includes(order)?order:'newest';
    const categoryText=category==='*'?'*':String(category).toLocaleLowerCase();
    const key=JSON.stringify([text,selectedScope,selectedOrder,locale,categoryText]);
    if(lastKey===key && lastResults)return lastResults;
    const filtered=entries.filter(entry=>{
      const {note,categoryLower}=entry;
      if(selectedScope==='pinned'&&!note.pinned)return false;
      if(selectedScope==='favourites'&&!note.favourite)return false;
      if(categoryText!=='*'&&categoryLower!==categoryText)return false;
      if(!text)return true;
      if(entry.searchText===null){
        entry.searchText=[note.title,note.body,categoryName(note.category),...note.items.map(item=>typeof item?.text==='string'?item.text:'')]
          .join(' ').toLocaleLowerCase();
      }
      return entry.searchText.includes(text);
    });
    const collator=selectedOrder==='title' ? new Intl.Collator(locale,{sensitivity:'base',numeric:true}) : null;
    filtered.sort((a,b)=>{
      const pinDifference=Number(Boolean(b.note.pinned))-Number(Boolean(a.note.pinned));
      if(pinDifference)return pinDifference;
      if(collator){
        const difference=collator.compare(a.note.title,b.note.title);
        if(difference)return difference;
      }else{
        const difference=b.time-a.time;
        if(difference)return selectedOrder==='oldest'?-difference:difference;
      }
      return String(a.note.id).localeCompare(String(b.note.id));
    });
    lastKey=key;
    lastResults=filtered.map(entry=>entry.note);
    return lastResults;
  };
  return {select};
}

/** Backwards-compatible one-shot selector, including all existing filters. */
export function selectNotes(notes,options={}) {
  return createNotesSelector(notes).select(options);
}

/** Most-recent saved notes, independent of pin state, with bounded top-k work.
 * A full sort of 1000 notes for three buttons is unnecessary.
 */
export function recentNotes(notes,max=3) {
  if(!Array.isArray(notes))return [];
  const cap=Number.isFinite(max)?Math.max(0,Math.min(5,Math.trunc(max))):3;
  if(!cap)return [];
  const best=[];
  const compare=(a,b)=>b.time-a.time||a.note.id.localeCompare(b.note.id);
  for(const note of notes){
    if(!note||typeof note.id!=='string'||typeof note.title!=='string'||typeof note.updatedAt!=='string')continue;
    const time=Date.parse(note.updatedAt);
    if(!Number.isFinite(time))continue;
    const entry={note,time};
    let i=0;
    while(i<best.length && compare(best[i],entry)<=0)i++;
    if(i<cap){best.splice(i,0,entry);if(best.length>cap)best.pop();}
    else if(best.length<cap)best.push(entry);
  }
  return best.map(entry=>entry.note);
}
