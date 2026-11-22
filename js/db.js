import { VERSION, DEFAULT_SETTINGS, TOOLS, CITIES, MAX_NOTES, MAX_WEATHER_CITIES } from './config.js';
import { safeClone } from './utils.js';
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
  'unitFavouritesData','recentTools'
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
export async function putNote(note) { return request('notes','readwrite',store => store.put(safeClone(note))); }
export async function deleteNote(id) { return request('notes','readwrite',store => store.delete(id)); }
export async function getMeta(key) {
  const record = await request('meta','readonly',store => store.get(key));
  return record?.value;
}
export async function setMeta(key, value) {
  return request('meta','readwrite',store => store.put({ key, value:safeClone(value) }));
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
  if(!Array.isArray(entry.daily)||entry.daily.length<1||entry.daily.length>7||!Array.isArray(entry.hours)||entry.hours.length>12)return false;
  if(entry.daily.some(d=>!d || !goodDay(d.date)||!goodNumber(d.min,-100,80)||!goodNumber(d.max,-100,80)||
    !maybeNumber(d.rain,0,10000)||!maybeNumber(d.prob,0,100)||!maybeNumber(d.wind,0,500)||!goodNumber(d.code,0,100)))return false;
  if(entry.hours.some(h=>!h || !goodTime(h.time)||!maybeNumber(h.temp,-100,80)||!maybeNumber(h.prob,0,100)))return false;
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
      typeof note.pinned !== 'boolean' || typeof note.favourite !== 'boolean' ||
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
  return { notes:safeClone(payload.notes), settings:safeSettings, calcHistory:safeClone(payload.calcHistory),weatherCache,timerData,calendarData,tasksData,quickListsData,footballData,rssData,bookmarksData,unitFavouritesData,recentTools };
}
export async function createBackup(snapshot = null) {
  const raw = snapshot ?? await readBackupSnapshot();
  const notes = raw.notes;
  const {settings:s,calcHistory:h,weatherCache:weather,timerData:timer,
    calendarData:calendar,tasksData:tasks,quickListsData:quickLists,
    footballData:football,rssData:rss,bookmarksData:bookmarks,
    unitFavouritesData:unitFavs,recentTools:recent} = raw.meta;
  if(calendar!==undefined && !validCalendarData(calendar))throw Error('Calendar data is damaged. Backup was stopped to avoid losing events.');
  if(tasks!==undefined && !validTasksData(tasks))throw Error('Task data is damaged. Backup was stopped to avoid losing tasks.');
  if(quickLists!==undefined && !validQuickListsData(quickLists))throw Error('Quick checklist data is damaged. Backup was stopped to avoid losing lists.');
  if(football!==undefined && !validFootballData(football))throw Error('Football data is damaged. Backup was stopped to avoid losing favourites.');
  if(rss!==undefined && !validRssData(rss))throw Error('RSS data is damaged. Backup stopped to avoid losing reading history.');
  if(bookmarks!==undefined && !validBookmarks(bookmarks))throw Error('Bookmarks data is damaged. Backup stopped to avoid losing links.');
  if(unitFavs!==undefined && !validUnitFavourites(unitFavs))throw Error('Unit favourites are damaged. Backup stopped.');
  if(recent!==undefined && !validRecentTools(recent))throw Error('Recent tools are damaged. Backup stopped.');
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
      recentTools:recent===undefined?[]:safeClone(recent) } };
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
          unitFavouritesData:data.unitFavouritesData, recentTools:data.recentTools
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
