/** MyHub v4.6 — crash-recovery snapshots for Notes.
 * Separate from IndexedDB and intentionally outside JSON Backup. Each editor
 * session has its own key: two tabs must never overwrite one another's drafts.
 * A synchronous localStorage write precedes the debounced IndexedDB save.
 * No automatic pruning or unsafe merge with a newer saved note.
 */
import {validStoredNote} from './notes-trash-core.js';

export const NOTES_DRAFT_PREFIX = 'myhub.notes.unsaved.v1.';
export const MAX_NOTES_DRAFT_CHARS = 600_000;
export const MAX_PENDING_CHECKLIST_CHARS = 220_000;
/** Legacy schema-1 draft records remain readable without this optional field. */
export function validPendingChecklist(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.single === 'string' && value.single.length <= 2000 &&
    typeof value.batch === 'string' && value.batch.length <= MAX_PENDING_CHECKLIST_CHARS;
}
export function hasPendingChecklist(value) {
  return validPendingChecklist(value) && Boolean(value.single.trim() || value.batch.trim());
}
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function notesMatch(a,b) { return validStoredNote(a) && validStoredNote(b) && equal(a,b); }

export function createNotesDraftStore(storage, {clock=()=>new Date().toISOString()}={}) {
  const read = key => {
    try {
      const raw=storage?.getItem(key);
      if(!raw || raw.length>MAX_NOTES_DRAFT_CHARS)return null;
      const record=JSON.parse(raw);
      if(record?.schema!==1 || !validStoredNote(record.baseline) ||
          !validStoredNote(record.draft) || record.baseline.id!==record.draft.id ||
          typeof record.editedAt!=='string' || !Number.isFinite(Date.parse(record.editedAt)) ||
          (record.pendingChecklist !== undefined &&
           (record.draft.kind !== 'checklist' || !validPendingChecklist(record.pendingChecklist) ||
             !hasPendingChecklist(record.pendingChecklist))))return null;
      return {key, raw, ...record};
    }catch{return null;}
  };
  return {
    makeKey: token => {
      if(typeof token!=='string' || !/^[a-f\d-]{16,80}$/i.test(token))throw Error('Invalid draft session token');
      return NOTES_DRAFT_PREFIX + token;
    },
    // Keep the original schema-1 note snapshot; pending composer text is optional
    // and never becomes a saved checklist item without the user's Add action.
    write(key, baseline, draft) {
      const previous=read(key);
      return this.writePending(key,baseline,draft,previous?.pendingChecklist,{writeSnapshot:true});
    },
    writePending(key, baseline, draft, pendingChecklist=undefined, {writeSnapshot=false}={}) {
      if(typeof key!=='string' || !key.startsWith(NOTES_DRAFT_PREFIX) ||
          !validStoredNote(baseline) || !validStoredNote(draft) ||
          baseline.id!==draft.id)return {ok:false,reason:'invalid'};
      if(pendingChecklist!==undefined &&
          (draft.kind!=='checklist' || !validPendingChecklist(pendingChecklist)))return {ok:false,reason:'invalid'};
      const hasPending=hasPendingChecklist(pendingChecklist);
      // Clearing the last unadded character must not leave a phantom draft,
      // but any unsaved EDIT to the note itself must remain recoverable.
      if(!writeSnapshot && !hasPending && notesMatch(baseline,draft)) {
        const previous=read(key);
        if(!previous)return {ok:true};
        return this.removeIfUnchanged(key,previous.raw)?{ok:true}:{ok:false,reason:'unavailable'};
      }
      try {
        const record={schema:1,baseline,draft,editedAt:clock()};
        if(hasPending)record.pendingChecklist={single:pendingChecklist.single,batch:pendingChecklist.batch};
        const raw=JSON.stringify(record);
        if(raw.length>MAX_NOTES_DRAFT_CHARS)return {ok:false,reason:'too-large'};
        if(!storage)return {ok:false,reason:'unavailable'};
        storage.setItem(key,raw);
        return {ok:true};
      }catch{return {ok:false,reason:'unavailable'};}
    },
    list(){
      if(!storage)return {drafts:[],unavailable:true,corrupt:0};
      try{
        const drafts=[];let corrupt=0;
        for(let i=0;i<storage.length;i++){
          const key=storage.key(i);
          if(!key?.startsWith(NOTES_DRAFT_PREFIX))continue;
          const record=read(key);
          if(record)drafts.push(record);
          else corrupt++;
        }
        drafts.sort((a,b)=>b.editedAt.localeCompare(a.editedAt));
        return {drafts,unavailable:false,corrupt};
      }catch{return {drafts:[],unavailable:true,corrupt:0};}
    },
    read,
    remove(key){
      if(!key?.startsWith(NOTES_DRAFT_PREFIX))return false;
      try{storage?.removeItem(key);return Boolean(storage);}catch{return false;}
    },
    /** Never remove a draft that may have changed in a still-open tab. */
    removeIfUnchanged(key, raw){
      try{
        if(!storage || !key?.startsWith(NOTES_DRAFT_PREFIX) || storage.getItem(key)!==raw)return false;
        storage.removeItem(key);return true;
      }catch{return false;}
    },
    /** A saved old revision must not erase a newer unsaved draft. */
    clearIfCommitted(key, committed){
      const record=read(key);
      return Boolean(record && !hasPendingChecklist(record.pendingChecklist) && notesMatch(record.draft,committed) && this.removeIfUnchanged(key,record.raw));
    },
  };
}
