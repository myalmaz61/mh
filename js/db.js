import { DEFAULT_SETTINGS, TOOLS, CITIES, MAX_NOTES } from './config.js';
import { safeClone } from './utils.js';
const DB_NAME = 'myhub-local';
const DB_VERSION = 1;
let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath:'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath:'key' });
    };
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
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
export function normaliseSettings(candidate) {
  const s = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const validToolIds = new Set(TOOLS.map(tool => tool.id));
  const validZones = new Set(CITIES.map(city => city.zone));
  const favorites = Array.isArray(s.favourites) ? [...new Set(s.favourites.filter(id => validToolIds.has(id)))].slice(0, TOOLS.length) : [...DEFAULT_SETTINGS.favourites];
  const zones = Array.isArray(s.timeZones) ? [...new Set(s.timeZones.filter(id => validZones.has(id)))].slice(0, CITIES.length) : [...DEFAULT_SETTINGS.timeZones];
  return {
    theme:['auto','light','dark'].includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    language:['bg','en'].includes(s.language) ? s.language : DEFAULT_SETTINGS.language,
    favourites:favorites,
    timeZones:zones,
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
  for (const h of payload.calcHistory) {
    if (!h || typeof h.expression !== 'string' || h.expression.length > 120 ||
      typeof h.result !== 'string' || h.result.length > 120 || !validIso(h.at)) throw Error('Невалидно изчисление / invalid calculation');
  }
  return { notes:safeClone(payload.notes), settings:normaliseSettings(settings), calcHistory:safeClone(payload.calcHistory) };
}
export async function createBackup() {
  const [notes, s, h] = await Promise.all([getNotes(), getMeta('settings'), getMeta('calcHistory')]);
  return { app:'MyHub', format:1, createdAt:new Date().toISOString(), version:'0.1.0',
    data:{ notes, settings:normaliseSettings(s), calcHistory:Array.isArray(h) ? h.slice(0, 30) : [] } };
}
export async function replaceFromBackup(payload) {
  const data = validateBackup(payload);
  const db = await openDatabase();
  // ONE transaction for both stores: an error aborts all operations.
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['notes','meta'],'readwrite');
    tx.objectStore('notes').clear();
    for (const note of data.notes) tx.objectStore('notes').put(note);
    tx.objectStore('meta').put({ key:'settings', value:data.settings });
    tx.objectStore('meta').put({ key:'calcHistory', value:data.calcHistory });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || Error('Backup restore failed'));
    tx.onabort = () => reject(tx.error || Error('Backup restore aborted'));
  });
}
