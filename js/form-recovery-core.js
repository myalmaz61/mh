/** MyHub 6.0.0: best-effort crash recovery for Tasks and Calendar editors.
 * Per-session keys prevent a second tab from overwriting another tab's draft.
 * Drafts stay in this browser's localStorage, OUTSIDE JSON Backup and IndexedDB.
 * Never automatically apply a draft to a changed saved record.
 */
export const FORM_DRAFT_PREFIX = 'myhub.form.unsaved.v1.';
const LIMIT = 24000;
const FIELDS = Object.freeze({
  tasks: Object.freeze({title:140,details:2000,due:10,priority:6}),
  calendar: Object.freeze({title:120,details:3000,date:10,time:5,repeat:7,repeatUntil:10}),
});
const validKey = (kind,key) => typeof key==='string' &&
  key.startsWith(`${FORM_DRAFT_PREFIX}${kind}.`) &&
  /^[a-zA-Z0-9_-]{12,100}$/.test(key.slice(`${FORM_DRAFT_PREFIX}${kind}.`.length));
const equal = (a,b) => JSON.stringify(a)===JSON.stringify(b);

export function validFormDraft(item) {
  if(!item || item.schema!==1 || !Object.hasOwn(FIELDS,item.kind) ||
     !Array.isArray(item.fields) || item.fields.length!==Object.keys(FIELDS[item.kind]).length ||
     typeof item.savedAt!=='string' || !Number.isFinite(Date.parse(item.savedAt)) ||
     (item.baseline!==null && (!item.baseline || typeof item.baseline!=='object' ||
       typeof item.baseline.id!=='string' || item.baseline.id.length>120 ||
       typeof item.baseline.updatedAt!=='string' || !Number.isFinite(Date.parse(item.baseline.updatedAt)))) )return false;
  const allowed=FIELDS[item.kind],seen=new Set();
  for(const entry of item.fields){
    if(!Array.isArray(entry)||entry.length!==2)return false;
    const [name,value]=entry;
    if(!Object.hasOwn(allowed,name)||seen.has(name)||typeof value!=='string'||value.length>allowed[name])return false;
    seen.add(name);
  }
  return seen.size===Object.keys(allowed).length;
}
export function formDraftDestination(draft, savedItems) {
  if(!validFormDraft(draft))return {mode:'invalid',id:null};
  if(!draft.baseline)return {mode:'new',id:null};
  const found=savedItems?.find(item=>item.id===draft.baseline.id);
  return found && equal(found,draft.baseline)
    ? {mode:'edit',id:found.id} : {mode:'copy',id:null};
}

export function applyFormDraft(form, draft) {
  if(!form || !validFormDraft(draft) || typeof form.querySelectorAll!=='function')return false;
  const fields=[...form.querySelectorAll('input[name], textarea[name], select[name]')];
  const entries=new Map(draft.fields);
  if([...entries.keys()].some(key=>!fields.some(field=>field.name===key)))return false;
  for(const field of fields){if(entries.has(field.name))field.value=entries.get(field.name);}
  return true;
}

export function createFormRecoveryStore(storage,{now=()=>new Date().toISOString()}={}){
  const makeKey=(kind,token)=>{
    if(!Object.hasOwn(FIELDS,kind)||typeof token!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(token))throw Error('Invalid recovery session');
    return `${FORM_DRAFT_PREFIX}${kind}.${token}`;
  };
  const read=(kind,key)=>{
    if(!validKey(kind,key))return null;
    try{
      const raw=storage?.getItem(key);
      if(typeof raw!=='string'||raw.length>LIMIT)return null;
      const data=JSON.parse(raw);
      return validFormDraft(data)&&data.kind===kind?{key,raw,...data}:null;
    }catch{return null;}
  };
  const removeIfUnchanged=(key,raw)=>{
    try{
      if(!storage || typeof raw!=='string' || !['tasks','calendar'].some(k=>validKey(k,key)) || storage.getItem(key)!==raw)return false;
      storage.removeItem(key);return true;
    }catch{return false;}
  };
  return {makeKey,read,removeIfUnchanged,
    write(kind,key,baseline,fields){
      if(!validKey(kind,key))return {ok:false,reason:'invalid'};
      const data={schema:1,kind,baseline:baseline??null,fields,savedAt:now()};
      if(!validFormDraft(data))return {ok:false,reason:'invalid'};
      const raw=JSON.stringify(data);
      if(raw.length>LIMIT)return {ok:false,reason:'too-large'};
      try{if(!storage)return {ok:false,reason:'unavailable'};
        storage.setItem(key,raw);return {ok:true,raw};
      }catch{return {ok:false,reason:'unavailable'};}
    },
    list(kind){
      if(!Object.hasOwn(FIELDS,kind))return {drafts:[],corrupt:0,unavailable:true};
      try{
        if(!storage)return {drafts:[],corrupt:0,unavailable:true};
        const drafts=[];let corrupt=0;
        for(let i=0;i<storage.length;i++){
          const key=storage.key(i);
          if(!validKey(kind,key))continue;
          const record=read(kind,key);
          if(record)drafts.push(record);else corrupt++;
        }
        drafts.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
        return {drafts,corrupt,unavailable:false};
      }catch{return {drafts:[],corrupt:0,unavailable:true};}
    },
    remove(kind,key){
      const record=read(kind,key);
      return record?removeIfUnchanged(key,record.raw):false;
    }
  };
}
