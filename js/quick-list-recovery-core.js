/** MyHub 6.1 — local drafts for Quick Lists; never included in JSON Backup. */
export const QUICK_DRAFT_PREFIX='myhub.quicklist.unsaved.v1.';
const FIELDS={'quick-new-form':['name',80],'quick-add-item':['text',250],'quick-rename-form':['name',80]};
const validId=v=>typeof v==='string'&&/^[-a-zA-Z0-9_]{1,100}$/.test(v);
const validKey=k=>typeof k==='string'&&k.startsWith(QUICK_DRAFT_PREFIX)&&/^[a-zA-Z0-9_-]{12,100}$/.test(k.slice(QUICK_DRAFT_PREFIX.length));
export function validQuickDraft(d){
  if(!d||typeof d!=='object'||Array.isArray(d)||d.schema!==1||d.kind!=='quicklist'||
     !Object.hasOwn(FIELDS,d.formId)||typeof d.savedAt!=='string'||!Number.isFinite(Date.parse(d.savedAt))||
     typeof d.listName!=='string'||d.listName.length>80||typeof d.baselineName!=='string'||d.baselineName.length>80||
     !Array.isArray(d.fields)||d.fields.length!==1)return false;
  const [name,max]=FIELDS[d.formId];const field=d.fields[0];
  if(!Array.isArray(field)||field.length!==2||field[0]!==name||typeof field[1]!=='string'||field[1].length>max)return false;
  if(d.formId==='quick-new-form')return d.listId===null&&d.listName===''&&d.baselineName==='';
  return validId(d.listId)&&Boolean(d.listName.trim())&&Boolean(d.baselineName.trim());
}
export function quickDraftDestination(d,lists){
  if(!validQuickDraft(d))return {mode:'invalid',listId:null};
  if(d.formId==='quick-new-form')return {mode:'new',listId:null};
  const found=Array.isArray(lists)?lists.find(item=>item.id===d.listId):null;
  if(!found||(d.formId==='quick-rename-form'&&found.name!==d.baselineName))return {mode:'new-list',listId:null};
  return {mode:d.formId==='quick-add-item'?'item':'rename',listId:found.id};
}
export function applyQuickDraftValue(form,d){
  if(!form||!validQuickDraft(d)||form.id!==d.formId||typeof form.querySelector!=='function')return false;
  const [name,value]=d.fields[0],field=form.querySelector(`[name="${name}"]`);
  if(!field)return false;field.value=value;return true;
}
export function createQuickRecoveryStore(storage,{now=()=>new Date().toISOString()}={}){
  const makeKey=token=>{if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(token))throw Error('Invalid session');return QUICK_DRAFT_PREFIX+token;};
  const read=key=>{if(!validKey(key))return null;try{const raw=storage?.getItem(key);if(typeof raw!=='string'||raw.length>3000)return null;
    const value=JSON.parse(raw);return validQuickDraft(value)?{key,raw,...value}:null;}catch{return null;}};
  const removeIfUnchanged=(key,raw)=>{try{if(!storage||!validKey(key)||typeof raw!=='string'||storage.getItem(key)!==raw)return false;
    storage.removeItem(key);return true;}catch{return false;}};
  const list=()=>{try{if(!storage)return {drafts:[],corrupt:0,unavailable:true};const drafts=[];let corrupt=0;
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!validKey(key))continue;
      const d=read(key);if(d)drafts.push(d);else corrupt++;}
    drafts.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));return {drafts,corrupt,unavailable:false};
  }catch{return {drafts:[],corrupt:0,unavailable:true};}};
  return {makeKey,read,list,removeIfUnchanged,
    remove(key){const d=read(key);return d?removeIfUnchanged(key,d.raw):false;},
    write(key,{formId,listId=null,listName='',baselineName='',fields}){
      if(!validKey(key))return {ok:false,reason:'invalid'};
      const data={schema:1,kind:'quicklist',formId,listId,listName,baselineName,fields,savedAt:now()};
      if(!validQuickDraft(data))return {ok:false,reason:'invalid'};
      const raw=JSON.stringify(data);if(raw.length>3000)return {ok:false,reason:'too-large'};
      try{if(!storage)return {ok:false,reason:'unavailable'};
        if(storage.getItem(key)===null&&list().drafts.length>=30)return {ok:false,reason:'limit'};
        storage.setItem(key,raw);return {ok:true,raw};
      }catch{return {ok:false,reason:'unavailable'};}
    }
  };
}
