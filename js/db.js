import { VERSION, DEFAULT_SETTINGS, TOOLS, CITIES, MAX_NOTES, MAX_WEATHER_CITIES } from './config.js';
import {safeClone} from './utils.js';
import {weatherCachePatch} from './weather-cache-core.js';
import { verifyBackupArchive } from './backup-integrity-core.js';
import {sameMetaSnapshot} from './meta-save-core.js';
import { emptyNotesTemplates, validNotesTemplates } from './notes-templates-core.js';
import { MAX_TRASH_NOTES, emptyNotesTrash, validNotesTrash, validStoredNote } from './notes-trash-core.js';
import {validNoteCategory} from './notes-category-core.js';
import {planBulkCategoryChange} from './notes-bulk-core.js';
import {planNoteQuickToggle} from './note-quick-core.js';
import { emptyCalendar, validCalendarData, MAX_CALENDAR_EVENTS } from './calendar-core.js';
import { emptyTasks, validTasksData, validTask, MAX_TASKS } from './tasks-core.js';
import { completeTodayTaskData } from './today-actions-core.js';
import { emptyQuickLists, validQuickListsData } from './quick-list-core.js';
import { emptyFootballData, validFootballData } from './football-core.js';
import { emptyRssData, validRssData } from './rss-core.js';
import { emptyBookmarks, validBookmarks } from './bookmarks-core.js';
import { emptyUnitFavourites, validUnitFavourites } from './unit-favourites-core.js';
import { normaliseToolOrder, validToolOrder } from './tool-order-core.js';
import { validRecentTools } from './recent-core.js';
import { validHiddenTools, normaliseHiddenTools } from './visibility-core.js';
import { defaultTimerData, normaliseTimerData, validTimerData, snapshotTimerForBackup } from './timer-core.js';
const DB_NAME = 'myhub-local';
const DB_VERSION = 1;
// Keep a deterministic list of user-data keys: a snapshot must contain all
// sections from the SAME IndexedDB transaction (including Notes).
const BACKUP_META_KEYS = [
  'settings','calcHistory','weatherCache','timerData','calendarData',
  'tasksData','quickListsData','footballData','rssData','bookmarksData',
  'unitFavouritesData','recentTools','notesTrashData','notesTemplatesData'
];
let dbPromise;

function rawSnapshot(notes, metaRows) {
  const rows = new Map((metaRows || []).map(row => [row.key, row.value]));
  const meta = {};
  for (const key of BACKUP_META_KEYS) if (rows.has(key)) meta[key] = rows.get(key);
  return { notes, meta };
}
/** One readonly transaction, covering Notes + every backed-up setting. No writes. */
export async function readBackupSnapshot() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['notes','meta'], 'readonly');
    const notesReq = tx.objectStore('notes').getAll();
    const metaReq = tx.objectStore('meta').getAll();
    tx.oncomplete = () => resolve(rawSnapshot(notesReq.result, metaReq.result));
    tx.onerror = () => reject(tx.error || Error('Cannot read data snapshot'));
    tx.onabort = () => reject(tx.error || Error('Data snapshot aborted'));
  });
}


export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath:'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath:'key' });
    };
    req.onsuccess = () => {
      const db=req.result;
      db.onversionchange=()=>{db.close();dbPromise=undefined;};
      db.onclose=()=>{dbPromise=undefined;};
      resolve(db);
    };
    req.onerror = () => reject(req.error || Error('IndexedDB error'));
    req.onblocked = () => reject(Error('Database blocked by another tab'));
  }).catch(err => { dbPromise = undefined; throw err; });
  return dbPromise;
}
async function request(storeName, mode, run) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    try { result = run(tx.objectStore(storeName)); }
    catch (err) { tx.abort(); reject(err); return; }
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error || Error('Transaction failed'));
    tx.onabort = () => reject(tx.error || Error('Transaction aborted'));
  });
}
export async function getNotes() { return await request('notes','readonly',store => store.getAll()) || []; }
/** Store a shared note without overwriting any existing note. The count check
 * and add are inside one readwrite transaction, safe against concurrent tabs.
 * A failed transaction leaves the incoming share receipt available to retry. */
export async function appendSharedNote(note){
  if(!validStoredNote(note)){
    const error=Error('Invalid shared note');error.code='invalid';throw error;
  }
  const snapshot=safeClone(note), db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notes','readwrite');
    const store=tx.objectStore('notes');
    let failure=null;
    const count=store.count();
    count.onsuccess=()=>{
      if(count.result>=MAX_NOTES){
        failure=Error('Notes limit reached');failure.code='limit';tx.abort();return;
      }
      store.add(snapshot); // add, NEVER put: an ID collision cannot overwrite.
    };
    tx.oncomplete=()=>resolve(snapshot.id);
    tx.onerror=()=>reject(failure||tx.error||Error('Shared note save failed'));
    tx.onabort=()=>reject(failure||tx.error||Error('Shared note save aborted'));
  });
}

export async function putNote(note) { return request('notes','readwrite',store => store.put(safeClone(note))); }
/** Save an edited note only if its exact original snapshot still exists.
 * Both the comparison and put are in ONE readwrite transaction; an older tab,
 * a deleted note or a concurrent quick action can never be overwritten.
 * Creating notes uses putNote separately; this function will not re-create a
 * note that another tab deleted while its editor was open.
 */
export async function putNoteIfUnchanged(note, expectedNote) {
  if (!validStoredNote(note) || !validStoredNote(expectedNote) || note.id !== expectedNote.id) {
    throw Error('Invalid note edit snapshot');
  }
  const snapshot=safeClone(note), expected=safeClone(expectedNote);
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notes','readwrite');
    const store=tx.objectStore('notes');
    let problem=null;
    const req=store.get(expected.id);
    req.onsuccess=()=>{
      const actual=req.result;
      if (!validStoredNote(actual) || JSON.stringify(actual)!==JSON.stringify(expected)) {
        problem=Error('Note changed in another tab or was deleted');
        problem.code='stale-note';tx.abort();return;
      }
      try { store.put(snapshot); }
      catch(err){problem=err;tx.abort();}
    };
    tx.oncomplete=()=>resolve(snapshot);
    tx.onerror=()=>reject(problem||tx.error||Error('Note save failed'));
    tx.onabort=()=>reject(problem||tx.error||Error('Note save aborted'));
  });
}
export async function deleteNote(id) { return request('notes','readwrite',store => store.delete(id)); }
/** Atomic compare-and-swap: a stale note can NEVER overwrite an updated note.
 * Only the flag and updatedAt are modified on the original snapshot. */
export async function toggleNoteQuickFlag(expectedNote, flag) {
  const proposed=planNoteQuickToggle(expectedNote,flag,new Date().toISOString());
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notes','readwrite');
    const store=tx.objectStore('notes');
    let failure=null;
    const read=store.get(expectedNote.id);
    read.onsuccess=()=>{
      const actual=read.result;
      if(!validStoredNote(actual)||JSON.stringify(actual)!==JSON.stringify(expectedNote)){
        failure=Error('Note changed in another tab');failure.code='stale-note';tx.abort();return;
      }
      try { store.put(safeClone(proposed)); }
      catch(err) { failure=err;tx.abort(); }
    };
    tx.oncomplete=()=>resolve(proposed);
    tx.onerror=()=>reject(failure||tx.error||Error('Quick action failed'));
    tx.onabort=()=>reject(failure||tx.error||Error('Quick action aborted'));
  });
}

/** All-or-nothing category update for 1–100 notes.
 * Each record must still equal its original snapshot. A stale tab, missing note
 * or failed write ABORTS the whole transaction; no partial update can commit.
 */
export async function changeNotesCategories(expectedNotes, category) {
  const updatedAt=new Date().toISOString();
  const updates=planBulkCategoryChange(expectedNotes, category, updatedAt);
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notes','readwrite');
    const store=tx.objectStore('notes');
    let remaining=updates.length, failure=null;
    const fail=error=>{failure=error;try{tx.abort();}catch{/* already aborted */}};
    for(let i=0;i<updates.length;i++){
      const expected=expectedNotes[i], next=updates[i];
      const req=store.get(expected.id);
      req.onsuccess=()=>{
        if(failure)return;
        const found=req.result;
        if(!validStoredNote(found) || JSON.stringify(found)!==JSON.stringify(expected)){
          const error=Error('Note was changed in another tab');error.code='stale-note';fail(error);return;
        }
        if(--remaining===0){
          try{for(const update of updates)store.put(safeClone(update));}
          catch(error){fail(error);}
        }
      };
    }
    tx.oncomplete=()=>resolve(updates);
    tx.onerror=()=>reject(failure||tx.error||Error('Bulk category change failed'));
    tx.onabort=()=>reject(failure||tx.error||Error('Bulk category change aborted'));
  });
}

/** One-click undo for a just-deleted note, only while Notes is open.
 * Use add (never put) so another tab's note with the same ID is NEVER overwritten.
 */
export async function restoreDeletedNote(note) {
  if (!note || typeof note.id !== 'string' || !note.id || !['text','checklist'].includes(note.kind) ||
      typeof note.title !== 'string' || typeof note.body !== 'string' || !Array.isArray(note.items)) {
    throw Error('Invalid deleted note');
  }
  const snapshot=safeClone(note);
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notes','readwrite');
    const store=tx.objectStore('notes');
    let reason=null;
    const count=store.count();
    count.onsuccess=()=>{
      if(count.result>=MAX_NOTES){reason=Error('limit');tx.abort();return;}
      store.add(snapshot); // a duplicate ID aborts the transaction instead of replacing it
    };
    tx.oncomplete=()=>resolve(note.id);
    tx.onerror=()=>reject(reason||tx.error||Error('Restore failed'));
    tx.onabort=()=>reject(reason||tx.error||Error('Restore aborted'));
  });
}


/** Move a note to trash as one atomic transaction: it is never deleted unless
 * its exact contents have been saved in the same commit. Stale tabs abort. */
export async function moveNoteToTrash(expectedNote) {
  if (!validStoredNote(expectedNote)) throw Error('Invalid note');
  const db = await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['notes','meta'],'readwrite');
    const notesStore=tx.objectStore('notes'), metaStore=tx.objectStore('meta');
    let failure=null, ready=0;
    const foundNote=notesStore.get(expectedNote.id);
    const foundTrash=metaStore.get('notesTrashData');
    function proceed(){
      if(++ready!==2)return;
      try{
        const current=foundNote.result;
        const trash=foundTrash.result ? foundTrash.result.value : emptyNotesTrash();
        if(!validNotesTrash(trash))throw Error('Trash contains invalid data');
        if(!current || !validStoredNote(current) || JSON.stringify(current)!==JSON.stringify(expectedNote)){
          const e=Error('Note changed in another tab'); e.code='stale-note';throw e;
        }
        if(trash.items.length>=MAX_TRASH_NOTES){const e=Error('Trash is full');e.code='trash-full';throw e;}
        if(trash.items.some(entry=>entry.note.id===current.id))throw Error('Duplicate trash ID');
        const next={schema:1,items:[...trash.items,{note:safeClone(current),deletedAt:new Date().toISOString()}]};
        metaStore.put({key:'notesTrashData',value:next});
        notesStore.delete(current.id);
      }catch(e){failure=e;tx.abort();}
    }
    foundNote.onsuccess=proceed;
    foundTrash.onsuccess=proceed;
    tx.oncomplete=()=>resolve(expectedNote.id);
    tx.onerror=()=>reject(failure||tx.error||Error('Unable to delete note'));
    tx.onabort=()=>reject(failure||tx.error||Error('Unable to move note to trash'));
  });
}

export async function getNotesTrash() {
  const value=await getMeta('notesTrashData');
  const trash=value===undefined?emptyNotesTrash():value;
  if(!validNotesTrash(trash))throw Error('Trash data is damaged');
  return trash;
}

/** Restore with add (never put) and remove from trash within ONE transaction.
 * An existing ID or the note limit aborts without losing the trashed item. */
export async function restoreTrashedNote(id) {
  if(typeof id!=='string'||!id)throw Error('Invalid trash ID');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['notes','meta'],'readwrite');
    const noteStore=tx.objectStore('notes'),metaStore=tx.objectStore('meta');
    let failure=null, ready=0, restored=null;
    const count=noteStore.count(), current=noteStore.get(id), row=metaStore.get('notesTrashData');
    function proceed(){
      if(++ready!==3)return;
      try{
        const trash=row.result?row.result.value:emptyNotesTrash();
        if(!validNotesTrash(trash))throw Error('Trash data is damaged');
        const item=trash.items.find(x=>x.note.id===id);
        if(!item)throw Error('Note missing from trash');
        if(current.result){const e=Error('Note ID already exists');e.code='duplicate';throw e;}
        if(count.result>=MAX_NOTES){const e=Error('Notes limit reached');e.code='limit';throw e;}
        restored=safeClone(item.note);
        noteStore.add(restored);
        metaStore.put({key:'notesTrashData',value:{schema:1,items:trash.items.filter(x=>x.note.id!==id)}});
      }catch(e){failure=e;tx.abort();}
    }
    count.onsuccess=proceed;current.onsuccess=proceed;row.onsuccess=proceed;
    tx.oncomplete=()=>resolve(restored);
    tx.onerror=()=>reject(failure||tx.error||Error('Unable to restore note'));
    tx.onabort=()=>reject(failure||tx.error||Error('Unable to restore note'));
  });
}

/** Erase one item only with explicit UI confirmation, no automatic pruning. */
export async function purgeTrashedNote(id) {
  if(typeof id!=='string'||!id)throw Error('Invalid trash ID');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite'); const store=tx.objectStore('meta');
    let failure=null;
    const req=store.get('notesTrashData');
    req.onsuccess=()=>{
      try{
        const trash=req.result?req.result.value:emptyNotesTrash();
        if(!validNotesTrash(trash))throw Error('Trash data is damaged');
        if(!trash.items.some(x=>x.note.id===id))throw Error('Item is no longer in trash');
        store.put({key:'notesTrashData',value:{schema:1,items:trash.items.filter(x=>x.note.id!==id)}});
      }catch(e){failure=e;tx.abort();}
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(failure||tx.error||Error('Delete failed'));
    tx.onabort=()=>reject(failure||tx.error||Error('Delete aborted'));
  });
}

/** Clear only the trash. Active Notes are never opened or modified. */
export async function emptyNotesTrashForever() {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');const store=tx.objectStore('meta');
    let failure=null;
    const req=store.get('notesTrashData');
    req.onsuccess=()=>{
      try{
        const trash=req.result?req.result.value:emptyNotesTrash();
        if(!validNotesTrash(trash))throw Error('Trash data is damaged');
        store.put({key:'notesTrashData',value:emptyNotesTrash()});
      }catch(e){failure=e;tx.abort();}
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(failure||tx.error||Error('Unable to empty trash'));
    tx.onabort=()=>reject(failure||tx.error||Error('Unable to empty trash'));
  });
}

export async function getMeta(key) {
  const record = await request('meta','readonly',store => store.get(key));
  return record?.value;
}
export async function setMeta(key, value) {
  return request('meta','readwrite',store => store.put({ key, value:safeClone(value) }));
}

/** Update ONLY the affected weather city in one IndexedDB transaction.
 * Read current settings and cache in the same transaction, so another tab's
 * newer forecast is preserved and a deleted city is never silently revived.
 * A damaged cache is never replaced without warning; JSON Backup stays v1.
 */
export async function updateWeatherCacheCity(cityId, snapshot=null){
  if(typeof cityId!=='string' || !cityId || cityId.length>120 ||
      (snapshot!==null && !validWeatherCacheEntry(snapshot)))throw Error('Invalid weather cache city or snapshot');
  const safeSnapshot=snapshot===null?null:safeClone(snapshot);
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');
    const store=tx.objectStore('meta');
    let failure=null, result=null;
    const abort=err=>{failure=err;try{tx.abort();}catch{/* already complete */}};
    const cacheRead=store.get('weatherCache');
    cacheRead.onsuccess=()=>{
      const settingsRead=store.get('settings');
      settingsRead.onsuccess=()=>{
        try{
          const previous=cacheRead.result?.value??{};
          if(!previous || typeof previous!=='object' || Array.isArray(previous) ||
              Object.keys(previous).length>MAX_WEATHER_CITIES ||
              Object.values(previous).some(item=>!validWeatherCacheEntry(item)))
            throw Error('Saved weather cache is damaged');
          const allowed=normaliseSettings(settingsRead.result?.value).weatherCities.map(city=>city.id);
          const updated=weatherCachePatch(previous,allowed,cityId,safeSnapshot);
          if(Object.keys(updated).length>MAX_WEATHER_CITIES)throw Error('Too many cached cities');
          result=updated[cityId]??null;
          store.put({key:'weatherCache',value:updated});
        }catch(error){abort(error);}
      };
    };
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(failure||tx.error||Error('Weather cache update failed'));
    tx.onabort=()=>reject(failure||tx.error||Error('Weather cache update aborted'));
  });
}
/** Atomic compare-and-swap for Tasks, Calendar, Quick Lists, templates and Bookmarks.
 * Read and write happen in ONE readwrite transaction; concurrent changes
 * (including Quick Add, Today and Restore) must not be silently overwritten.
 */
export async function setMetaIfUnchanged(key, expectedValue, nextValue) {
  if (!['tasksData','calendarData','quickListsData','notesTemplatesData','bookmarksData'].includes(key)) throw Error('Unsupported guarded meta key');
  const snapshot=safeClone(nextValue);
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');
    const store=tx.objectStore('meta');
    let failure=null;
    const read=store.get(key);
    read.onsuccess=()=>{
      const actual=read.result?read.result.value:undefined;
      if(!sameMetaSnapshot(actual, expectedValue)){
        failure=Error('Data changed in another tab or tool');
        failure.code='stale-meta';
        tx.abort();return;
      }
      try{store.put({key,value:snapshot});}
      catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(failure||tx.error||Error('Guarded save failed'));
    tx.onabort=()=>reject(failure||tx.error||Error('Guarded save aborted'));
  });
}
/** Atomically append one valid task without overwriting a concurrently changed list. */
export async function appendQuickTask(task) {
  if(!validTask(task))throw Error('Invalid quick task');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');
    const store=tx.objectStore('meta');
    let reason=null;
    const req=store.get('tasksData');
    req.onsuccess=()=>{
      const existing=req.result ? req.result.value : emptyTasks();
      if(!validTasksData(existing)){reason=Error('corrupt');tx.abort();return;}
      if(existing.tasks.length>=MAX_TASKS){reason=Error('limit');tx.abort();return;}
      if(existing.tasks.some(item=>item.id===task.id)){reason=Error('duplicate');tx.abort();return;}
      store.put({key:'tasksData',value:{schema:1,tasks:[...existing.tasks,safeClone(task)]}});
    };
    tx.oncomplete=()=>resolve(task.id);
    tx.onerror=()=>reject(reason||tx.error||Error('Save failed'));
    tx.onabort=()=>reject(reason||tx.error||Error('Save aborted'));
  });
}
/** Mark ONE pending Today task as done using a single readwrite transaction.
 * Reject stale screens instead of overwriting changes from Tasks / another tab.
 */
export async function completeTodayTask(id, expectedUpdatedAt) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');
    const store=tx.objectStore('meta');
    let reason=null;
    const request=store.get('tasksData');
    request.onsuccess=()=>{
      try{
        const current=request.result ? request.result.value : emptyTasks();
        const next=completeTodayTaskData(current,id,expectedUpdatedAt,new Date().toISOString());
        store.put({key:'tasksData',value:next});
      }catch(err){reason=err;tx.abort();}
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(reason||tx.error||Error('Unable to complete task'));
    tx.onabort=()=>reject(reason||tx.error||Error('Unable to complete task'));
  });
}
/** Append one Calendar event atomically. Refuse damaged existing Calendar data. */
export async function appendQuickCalendarEvent(item) {
  if(!validCalendarData({schema:1,events:[item]}))throw Error('Invalid quick calendar event');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');
    const store=tx.objectStore('meta');
    let reason=null;
    const req=store.get('calendarData');
    req.onsuccess=()=>{
      const existing=req.result ? req.result.value : emptyCalendar();
      if(!validCalendarData(existing)){reason=Error('corrupt');tx.abort();return;}
      if(existing.events.length>=MAX_CALENDAR_EVENTS){reason=Error('limit');tx.abort();return;}
      if(existing.events.some(e=>e.id===item.id)){reason=Error('duplicate');tx.abort();return;}
      store.put({key:'calendarData',value:{schema:1,events:[...existing.events,safeClone(item)]}});
    };
    tx.oncomplete=()=>resolve(item.id);
    tx.onerror=()=>reject(reason||tx.error||Error('Save failed'));
    tx.onabort=()=>reject(reason||tx.error||Error('Save aborted'));
  });
}
/** Append a shared bookmark atomically, protecting existing Bookmarks from stale writes. */
export async function appendSharedBookmark(item) {
  if (!validBookmarks({schema:1,items:[item]})) {
    const error=Error('Invalid bookmark');error.code='invalid';throw error;
  }
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');
    const store=tx.objectStore('meta');
    let reason=null;
    const req=store.get('bookmarksData');
    req.onsuccess=()=>{
      const existing=req.result ? req.result.value : emptyBookmarks();
      if(!validBookmarks(existing)){
        reason=Error('Invalid existing bookmarks');reason.code='corrupt';tx.abort();return;
      }
      const found=existing.items.find(x=>x.url===item.url);
      if(found){
        reason=Error('Duplicate URL');reason.code='duplicate';reason.existingId=found.id;tx.abort();return;
      }
      if(existing.items.length>=500){reason=Error('Bookmark limit');reason.code='limit';tx.abort();return;}
      store.put({key:'bookmarksData',value:{schema:1,items:[...existing.items,safeClone(item)]}});
    };
    tx.oncomplete=()=>resolve(item.id);
    tx.onerror=()=>reject(reason||tx.error||Error('Bookmark save failed'));
    tx.onabort=()=>reject(reason||tx.error||Error('Bookmark save aborted'));
  });
}
function validCity(city) {
  if (!city || typeof city !== 'object' || Array.isArray(city) ||
    typeof city.id !== 'string' || !/^[A-Za-z0-9-]{1,90}$/.test(city.id) ||
    typeof city.name !== 'string' || city.name.length<1 || city.name.length>80 ||
    typeof city.region !== 'string' || city.region.length>80 ||
    typeof city.country !== 'string' || city.country.length>80 ||
    typeof city.latitude !== 'number' || !Number.isFinite(city.latitude) || Math.abs(city.latitude)>90 ||
    typeof city.longitude !== 'number' || !Number.isFinite(city.longitude) || Math.abs(city.longitude)>180) return false;
  return true;
}
export function normaliseWeatherCities(value) {
  if (!Array.isArray(value)) return safeClone(DEFAULT_SETTINGS.weatherCities);
  const seen=new Set(); const cities=[];
  for (const city of value) {
    if (!validCity(city) || seen.has(city.id)) continue;
    cities.push({id:city.id,name:city.name,region:city.region,country:city.country,
      latitude:city.latitude,longitude:city.longitude});
    seen.add(city.id);
    if (cities.length>=MAX_WEATHER_CITIES) break;
  }
  return cities;
}
const goodNumber=(value,lo,hi)=>typeof value==='number' && Number.isFinite(value) && value>=lo && value<=hi;
const maybeNumber=(value,lo,hi)=>value===null || goodNumber(value,lo,hi);
const goodTime=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
const goodDay=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T12:00:00Z'));
function validWeatherCacheEntry(entry) {
  if (!entry || !Number.isFinite(Date.parse(entry.fetchedAt)) || typeof entry.fetchedAt!=='string')return false;
  const c=entry.current;
  if(!c || !goodTime(c.time) || !goodNumber(c.temp,-100,80) || !goodNumber(c.feels,-120,90) ||
    !goodNumber(c.humidity,0,100)||!goodNumber(c.wind,0,500)||!goodNumber(c.rain,0,10000)||
    !goodNumber(c.code,0,100)||typeof c.isDay!=='boolean')return false;
  if(!Array.isArray(entry.daily)||entry.daily.length<1||entry.daily.length>7||!Array.isArray(entry.hours)||entry.hours.length>48)return false;
  if(entry.daily.some(d=>!d || !goodDay(d.date)||!goodNumber(d.min,-100,80)||!goodNumber(d.max,-100,80)||
    !maybeNumber(d.rain,0,10000)||!maybeNumber(d.prob,0,100)||!maybeNumber(d.wind,0,500)||!goodNumber(d.code,0,100)))return false;
  if(entry.hours.some(h=>!h || !goodTime(h.time)||!maybeNumber(h.temp,-100,80)||!maybeNumber(h.prob,0,100)||
    (h.wind!==undefined && !maybeNumber(h.wind,0,500))))return false;
  return true;
}
function validateWeatherCache(value,weatherCities) {
  if(value===undefined)return {};
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length>MAX_WEATHER_CITIES)throw Error('Невалиден кеш на времето / invalid weather cache');
  const allowed=new Set(weatherCities.map(city=>city.id));
  const clean={};
  for(const [id,entry] of Object.entries(value)){
    if(!allowed.has(id)||!validWeatherCacheEntry(entry))throw Error('Невалидна прогноза / invalid forecast');
    clean[id]=safeClone(entry);
  }
  return clean;
}
export function normaliseSettings(candidate) {
  const s = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const validToolIds = new Set(TOOLS.map(tool => tool.id));
  const validZones = new Set(CITIES.map(city => city.zone));
  const favorites = Array.isArray(s.favourites) ? [...new Set(s.favourites.filter(id => validToolIds.has(id)))].slice(0, TOOLS.length) : [...DEFAULT_SETTINGS.favourites];
  const zones = Array.isArray(s.timeZones) ? [...new Set(s.timeZones.filter(id => validZones.has(id)))].slice(0, CITIES.length) : [...DEFAULT_SETTINGS.timeZones];
  const weatherCities=normaliseWeatherCities(s.weatherCities);
  const weatherSelectedId=weatherCities.some(c=>c.id===s.weatherSelectedId)?s.weatherSelectedId:(weatherCities[0]?.id||'');
  return {
    theme:['auto','light','dark'].includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    backupReminderDays:[0,7,14,30].includes(s.backupReminderDays) ? s.backupReminderDays : DEFAULT_SETTINGS.backupReminderDays,
    language:['bg','en'].includes(s.language) ? s.language : DEFAULT_SETTINGS.language,
    favourites:favorites,
    hiddenTools:normaliseHiddenTools(s.hiddenTools),
    toolOrder:normaliseToolOrder(s.toolOrder),
    timeZones:zones,
    weatherCities, weatherSelectedId,
  };
}
export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.app !== 'MyHub' || data.format !== 1) throw Error('Неподдържан формат / unsupported format');
  const payload = data.data;
  if (!payload || !Array.isArray(payload.notes) || payload.notes.length > MAX_NOTES) throw Error('Невалидни бележки / invalid notes');
  if (!payload.settings || typeof payload.settings !== 'object' || Array.isArray(payload.settings)) throw Error('Невалидни настройки / invalid settings');
  if (!Array.isArray(payload.calcHistory) || payload.calcHistory.length > 30) throw Error('Невалидна история / invalid history');
  if (JSON.stringify(data).length > 20_000_000) throw Error('Архивът е твърде голям / backup too large');
  const seen = new Set();
  const validIso = v => typeof v === 'string' && v.length <= 32 && !Number.isNaN(Date.parse(v));
  for (const note of payload.notes) {
    if (!note || typeof note !== 'object' || Array.isArray(note) ||
      typeof note.id !== 'string' || note.id.length < 1 || note.id.length > 100 || seen.has(note.id) ||
      !['text','checklist'].includes(note.kind) || typeof note.title !== 'string' || note.title.length > 200 ||
      typeof note.body !== 'string' || note.body.length > 100_000 ||
      typeof note.pinned !== 'boolean' || typeof note.favourite !== 'boolean' || !validNoteCategory(note.category) ||
      !validIso(note.createdAt) || !validIso(note.updatedAt) ||
      !Array.isArray(note.items) || note.items.length > 300) throw Error('Невалидна бележка / invalid note');
    seen.add(note.id);
    const seenItems = new Set();
    for (const item of note.items) {
      if (!item || typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 100 ||
        seenItems.has(item.id) || typeof item.text !== 'string' || item.text.length > 2000 || typeof item.done !== 'boolean') throw Error('Невалиден ред / invalid checklist item');
      seenItems.add(item.id);
    }
  }
  // v3: old archives have no trash; a missing section means an empty trash after Restore.
  if(payload.notesTrashData!==undefined && !validNotesTrash(payload.notesTrashData,[...seen]))
    throw Error('Невалидно кошче за бележки / invalid notes trash');
  const notesTrashData=payload.notesTrashData===undefined?emptyNotesTrash():safeClone(payload.notesTrashData);
  if(payload.notesTemplatesData!==undefined && !validNotesTemplates(payload.notesTemplatesData))throw Error('Невалидни шаблони / invalid notes templates');
  const notesTemplatesData=payload.notesTemplatesData===undefined?emptyNotesTemplates():safeClone(payload.notesTemplatesData);
  const settings = payload.settings;
  if (!['auto','light','dark'].includes(settings.theme) || !['bg','en'].includes(settings.language) ||
    !Array.isArray(settings.favourites) || !Array.isArray(settings.timeZones) ||
    settings.favourites.length > TOOLS.length || settings.timeZones.length > CITIES.length ||
    settings.favourites.some(v => typeof v !== 'string' || !TOOLS.some(t => t.id === v)) ||
    settings.timeZones.some(v => typeof v !== 'string' || !CITIES.some(c => c.zone === v)) ||
    new Set(settings.favourites).size !== settings.favourites.length || new Set(settings.timeZones).size !== settings.timeZones.length) throw Error('Невалидни предпочитания / invalid preferences');
  // Older archives have no backup reminder preference. Preserve their defaults.
  if(settings.backupReminderDays!==undefined && ![0,7,14,30].includes(settings.backupReminderDays))throw Error('Невалидно напомняне за архив / invalid backup reminder');
  // Older archives may have no hiddenTools/toolOrder; absent means defaults.
  if(settings.hiddenTools!==undefined && !validHiddenTools(settings.hiddenTools))throw Error('Невалидни скрити инструменти / invalid hidden tools');
  if(settings.toolOrder!==undefined && !validToolOrder(settings.toolOrder))throw Error('Невалиден ред на инструментите / invalid tool order');
  // v0.1 backups have no weather properties and remain fully supported.
  if (settings.weatherCities !== undefined) {
    if(!Array.isArray(settings.weatherCities) || settings.weatherCities.length>MAX_WEATHER_CITIES ||
      settings.weatherCities.some(c=>!validCity(c)) ||
      new Set(settings.weatherCities.map(c=>c.id)).size !== settings.weatherCities.length ||
      typeof settings.weatherSelectedId !== 'string' ||
      (settings.weatherSelectedId !== '' && !settings.weatherCities.some(c=>c.id===settings.weatherSelectedId)) ||
      (settings.weatherSelectedId === '' && settings.weatherCities.length>0))throw Error('Невалидни градове за време / invalid weather cities');
  } else if (settings.weatherSelectedId !== undefined) throw Error('Invalid weather selection');
  for (const h of payload.calcHistory) {
    if (!h || typeof h.expression !== 'string' || h.expression.length > 120 ||
      typeof h.result !== 'string' || h.result.length > 120 || !validIso(h.at)) throw Error('Невалидно изчисление / invalid calculation');
  }
  const safeSettings=normaliseSettings(settings);
  const weatherCache=validateWeatherCache(payload.weatherCache, safeSettings.weatherCities);
  // Older v0.1 / v0.2 archives do not contain timerData.
  if(payload.timerData!==undefined && !validTimerData(payload.timerData))throw Error('Невалиден таймер / invalid timer data');
  const timerData=payload.timerData===undefined ? defaultTimerData() : structuredClone(payload.timerData);
  // v0.1–v0.3 archives have no calendarData and remain compatible.
  if(payload.calendarData!==undefined && !validCalendarData(payload.calendarData))throw Error('Невалиден календар / invalid calendar');
  const calendarData=payload.calendarData===undefined?emptyCalendar():safeClone(payload.calendarData);
  // Backups created before v0.5 have neither Tasks nor Quick Checklists.
  if(payload.tasksData!==undefined && !validTasksData(payload.tasksData))throw Error('Невалидни задачи / invalid tasks');
  if(payload.quickListsData!==undefined && !validQuickListsData(payload.quickListsData))throw Error('Невалидни бързи списъци / invalid quick lists');
  const tasksData=payload.tasksData===undefined?emptyTasks():safeClone(payload.tasksData);
  const quickListsData=payload.quickListsData===undefined?emptyQuickLists():safeClone(payload.quickListsData);
  // Backups v0.1–v0.5 had no football section: restore it empty without touching others.
  if(payload.footballData!==undefined && !validFootballData(payload.footballData))throw Error('Невалиден футболен архив / invalid football data');
  const footballData=payload.footballData===undefined?emptyFootballData():safeClone(payload.footballData);
  // v0.1–v0.6 had no RSS section. Missing means an empty reader, never an error.
  if(payload.rssData!==undefined && !validRssData(payload.rssData))throw Error('Невалидни RSS данни / invalid RSS data');
  const rssData=payload.rssData===undefined?emptyRssData():safeClone(payload.rssData);
  // All pre-v0.8 archives restore with an empty bookmarks collection.
  if(payload.bookmarksData!==undefined && !validBookmarks(payload.bookmarksData))throw Error('Невалидни запазени връзки / invalid bookmarks');
  const bookmarksData=payload.bookmarksData===undefined?emptyBookmarks():safeClone(payload.bookmarksData);
  // Older backups pre-date v1.4: an absent list is not an error.
  if(payload.unitFavouritesData!==undefined && !validUnitFavourites(payload.unitFavouritesData))throw Error('Невалидни любими преобразувания / invalid unit favourites');
  if(payload.recentTools!==undefined && !validRecentTools(payload.recentTools))throw Error('Невалидни последни инструменти / invalid recent tools');
  const unitFavouritesData=payload.unitFavouritesData===undefined?emptyUnitFavourites():safeClone(payload.unitFavouritesData);
  const recentTools=payload.recentTools===undefined?[]:safeClone(payload.recentTools);
  return { notes:safeClone(payload.notes), settings:safeSettings, calcHistory:safeClone(payload.calcHistory),weatherCache,timerData,calendarData,tasksData,quickListsData,footballData,rssData,bookmarksData,unitFavouritesData,recentTools,notesTrashData,notesTemplatesData };
}
export async function createBackup(snapshot = null) {
  const raw = snapshot ?? await readBackupSnapshot();
  const notes = raw.notes;
  const {settings:s,calcHistory:h,weatherCache:weather,timerData:timer,
    calendarData:calendar,tasksData:tasks,quickListsData:quickLists,
    footballData:football,rssData:rss,bookmarksData:bookmarks,
    unitFavouritesData:unitFavs,recentTools:recent,notesTrashData:trash,notesTemplatesData:templates} = raw.meta;
  if(calendar!==undefined && !validCalendarData(calendar))throw Error('Calendar data is damaged. Backup was stopped to avoid losing events.');
  if(tasks!==undefined && !validTasksData(tasks))throw Error('Task data is damaged. Backup was stopped to avoid losing tasks.');
  if(quickLists!==undefined && !validQuickListsData(quickLists))throw Error('Quick checklist data is damaged. Backup was stopped to avoid losing lists.');
  if(football!==undefined && !validFootballData(football))throw Error('Football data is damaged. Backup was stopped to avoid losing favourites.');
  if(rss!==undefined && !validRssData(rss))throw Error('RSS data is damaged. Backup stopped to avoid losing reading history.');
  if(bookmarks!==undefined && !validBookmarks(bookmarks))throw Error('Bookmarks data is damaged. Backup stopped to avoid losing links.');
  if(unitFavs!==undefined && !validUnitFavourites(unitFavs))throw Error('Unit favourites are damaged. Backup stopped.');
  if(recent!==undefined && !validRecentTools(recent))throw Error('Recent tools are damaged. Backup stopped.');
  if(trash!==undefined && !validNotesTrash(trash,notes.map(n=>n.id)))throw Error('Notes trash is damaged. Backup stopped.');
  if(templates!==undefined && !validNotesTemplates(templates))throw Error('Notes templates are damaged. Backup stopped without deleting them.');
  const cleanSettings=normaliseSettings(s);
  const cleanCache={};
  // Never silently drop a malformed forecast for a city the user still has.
  if(weather!==undefined && (!weather||typeof weather!=='object'||Array.isArray(weather)))throw Error('Weather cache is damaged. Backup stopped.');
  for(const city of cleanSettings.weatherCities){
    const item=weather?.[city.id];
    if(item!==undefined){
      if(!validWeatherCacheEntry(item))throw Error('Weather cache is damaged. Backup stopped.');
      cleanCache[city.id]=item;
    }
  }
  const backup={ app:'MyHub', format:1, createdAt:new Date().toISOString(), version:VERSION,
    data:{ notes, settings:cleanSettings, calcHistory:Array.isArray(h) ? h.slice(0, 30) : [], weatherCache:cleanCache, timerData:snapshotTimerForBackup(normaliseTimerData(timer)), calendarData:calendar===undefined?emptyCalendar():safeClone(calendar),
      tasksData:tasks===undefined?emptyTasks():safeClone(tasks), quickListsData:quickLists===undefined?emptyQuickLists():safeClone(quickLists),
      footballData:football===undefined?emptyFootballData():safeClone(football),
      rssData:rss===undefined?emptyRssData():safeClone(rss),
      bookmarksData:bookmarks===undefined?emptyBookmarks():safeClone(bookmarks),
      unitFavouritesData:unitFavs===undefined?emptyUnitFavourites():safeClone(unitFavs),
      recentTools:recent===undefined?[]:safeClone(recent),
      notesTrashData:trash===undefined?emptyNotesTrash():safeClone(trash),
      notesTemplatesData:templates===undefined?emptyNotesTemplates():safeClone(templates) } };
  // Verify both raw stored fields and the final export. Normalisation must not
  // conceal damaged user settings, timer or calculator history.
  const preflight=structuredClone(backup);
  if(s!==undefined)preflight.data.settings=s;
  if(h!==undefined)preflight.data.calcHistory=h;
  if(timer!==undefined)preflight.data.timerData=timer;
  validateBackup(preflight);
  validateBackup(backup);
  return backup;
}
/**
 * Restore only if the user has viewed the SAME local snapshot. Changes made
 * in another tab after the preview abort the transaction without any writes.
 * Passing no expectedSnapshot preserves the existing public API.
 */
export async function replaceFromBackup(payload, expectedSnapshot = null) {
  const data = validateBackup(payload);
  // An archive with an integrity marker must pass verification even when this
  // API is called directly. Legacy format:1 files still work unchanged.
  await verifyBackupArchive(payload);
  if (expectedSnapshot !== null && (!expectedSnapshot ||
      !Array.isArray(expectedSnapshot.notes) || !expectedSnapshot.meta ||
      typeof expectedSnapshot.meta !== 'object')) throw Error('Invalid restore snapshot');
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['notes','meta'],'readwrite');
    const notesStore = tx.objectStore('notes');
    const metaStore = tx.objectStore('meta');
    let failure = null;
    function writeAll() {
      try {
        notesStore.clear();
        for (const note of data.notes) notesStore.put(note);
        const values = {
          settings:data.settings, calcHistory:data.calcHistory,
          weatherCache:data.weatherCache, timerData:data.timerData,
          calendarData:data.calendarData, tasksData:data.tasksData,
          quickListsData:data.quickListsData, footballData:data.footballData,
          rssData:data.rssData, bookmarksData:data.bookmarksData,
          unitFavouritesData:data.unitFavouritesData, recentTools:data.recentTools,
          notesTrashData:data.notesTrashData, notesTemplatesData:data.notesTemplatesData
        };
        for (const key of BACKUP_META_KEYS) metaStore.put({key,value:values[key]});
        // An export prepared BEFORE this Restore no longer covers these data.
        // Do not present its timestamp as a recent backup of restored content.
        metaStore.delete('lastBackupExportAt');
      } catch (error) { failure=error;tx.abort(); }
    }
    if (expectedSnapshot) {
      const notesReq = notesStore.getAll();
      const metaReq = metaStore.getAll();
      let done = 0;
      function checkAndWrite() {
        if (++done !== 2) return;
        const now = rawSnapshot(notesReq.result,metaReq.result);
        if (JSON.stringify(now) !== JSON.stringify(expectedSnapshot)) {
          failure = Error('Local data changed since Restore preview');
          failure.code = 'stale-preview';
          tx.abort();
          return;
        }
        writeAll();
      }
      notesReq.onsuccess = checkAndWrite;
      metaReq.onsuccess = checkAndWrite;
    } else writeAll();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(failure || tx.error || Error('Backup restore failed'));
    tx.onabort = () => reject(failure || tx.error || Error('Backup restore aborted'));
  });
}
