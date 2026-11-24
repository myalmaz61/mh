/** MyHub v5.3 — local reusable Notes templates. Never mutates the original note. */
export const MAX_NOTE_TEMPLATES=50;
export const emptyNotesTemplates=()=>({schema:1,items:[]});
const validDate=value=>typeof value==='string'&&value.length<=32&&Number.isFinite(Date.parse(value));
const validLabel=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=100&&value.length<=100&&!/[\u0000-\u001f\u007f]/.test(value);
const validCategory=value=>typeof value==='string'&&value.length<=40&&!/[\u0000-\u001f\u007f]/.test(value);
export function validNotesTemplates(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.schema!==1||!Array.isArray(data.items)||data.items.length>MAX_NOTE_TEMPLATES)return false;
 const ids=new Set();
 for(const t of data.items){
  if(!t||typeof t!=='object'||Array.isArray(t)||typeof t.id!=='string'||!t.id||t.id.length>100||ids.has(t.id)||!validLabel(t.name)||
    !['text','checklist'].includes(t.kind)||typeof t.title!=='string'||t.title.length>200||typeof t.body!=='string'||t.body.length>100000||
    !validCategory(t.category)||!Array.isArray(t.items)||t.items.length>300||t.items.some(s=>typeof s!=='string'||s.length>2000)||
    !validDate(t.createdAt)||!validDate(t.updatedAt))return false;
  ids.add(t.id);
 }
 return true;
}
export function templateFromNote(note,{id,name,now}){
 if(!note||!['text','checklist'].includes(note.kind)||typeof note.title!=='string'||note.title.length>200||
    typeof note.body!=='string'||note.body.length>100000||!Array.isArray(note.items)||note.items.length>300||
    note.items.some(x=>!x||typeof x.text!=='string'||x.text.length>2000)||!validLabel(name)||
    typeof id!=='string'||!id||id.length>100||!validDate(now))throw Error('Invalid note template');
 const template={id,name:name.trim(),kind:note.kind,title:note.title,body:note.body,
   category:validCategory(note.category)?note.category:'',items:note.items.map(i=>i.text),createdAt:now,updatedAt:now};
 if(!validNotesTemplates({schema:1,items:[template]}))throw Error('Invalid template');
 return template;
}
export function noteFromTemplate(template,{id,newItemId,now}){
 if(!validNotesTemplates({schema:1,items:[template]})||typeof id!=='string'||!id||id.length>100||typeof newItemId!=='function'||!validDate(now))throw Error('Invalid template for note');
 return {id,kind:template.kind,title:template.title,body:template.body,items:template.items.map(text=>({id:newItemId(),text,done:false})),
 category:template.category,pinned:false,favourite:false,createdAt:now,updatedAt:now};
}
export function templateAdd(data,item){
 if(!validNotesTemplates(data)||!validNotesTemplates({schema:1,items:[item]}))throw Error('Invalid template data');
 if(data.items.length>=MAX_NOTE_TEMPLATES)throw Error('Template limit reached');
 if(data.items.some(t=>t.id===item.id))throw Error('Template ID already exists');
 return {schema:1,items:[...data.items,item]};
}
export function templateRename(data,id,name,now){
 if(!validNotesTemplates(data)||!validLabel(name)||!validDate(now)||!data.items.some(t=>t.id===id))throw Error('Invalid template rename');
 return {schema:1,items:data.items.map(t=>t.id===id?{...t,name:name.trim(),updatedAt:now}:t)};
}
export function templateRemove(data,id){
 if(!validNotesTemplates(data)||!data.items.some(t=>t.id===id))throw Error('Invalid template removal');
 return {schema:1,items:data.items.filter(t=>t.id!==id)};
}
