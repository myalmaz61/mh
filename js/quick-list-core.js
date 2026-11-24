/** Small, standalone checklist collections; never change Notes records. */
export const MAX_QUICK_LISTS = 50;
export const MAX_QUICK_ITEMS = 100;
export const emptyQuickLists = () => ({schema:1, lists:[]});
const validId = value => typeof value === 'string' && /^[-a-zA-Z0-9_]{1,100}$/.test(value);
const validStamp = value => typeof value === 'string' && value.length<=32 &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function validQuickListsData(value) {
  if(!value || typeof value !== 'object' || Array.isArray(value) || value.schema!==1 ||
     !Array.isArray(value.lists) || value.lists.length>MAX_QUICK_LISTS)return false;
  const ids=new Set();
  for(const list of value.lists){
    if(!list || typeof list !== 'object' || Array.isArray(list) ||
       !validId(list.id) || ids.has(list.id) ||
       typeof list.name!=='string' || !list.name.trim() || list.name.length>80 ||
       !validStamp(list.createdAt) || !validStamp(list.updatedAt) ||
       !Array.isArray(list.items) || list.items.length>MAX_QUICK_ITEMS) return false;
    ids.add(list.id);
    const itemIds=new Set();
    for(const item of list.items){
      if(!item || typeof item !== 'object' || Array.isArray(item) ||
         !validId(item.id) || itemIds.has(item.id) || typeof item.text!=='string' ||
         !item.text.trim() || item.text.length>250 || typeof item.done!=='boolean')return false;
      itemIds.add(item.id);
    }
  }
  return true;
}
export function quickProgress(list){
  const total=list.items.length,done=list.items.filter(item=>item.done).length;
  return {total,done,remaining:total-done};
}

/** Untick checked items without destroying text or item IDs. */
export function resetQuickTicks(list,stamp){
  const result={...list,updatedAt:stamp,items:list.items.map(item=>({...item,done:false}))};
  if(!validQuickListsData({schema:1,lists:[result]}))throw Error('Invalid quick-list reset');
  return result;
}
/** Independent duplicate: the original list and its item IDs stay unchanged. */
export function duplicateQuickList(list,{id,itemIds,name,stamp}){
  if(!validQuickListsData({schema:1,lists:[list]})||!Array.isArray(itemIds)||itemIds.length!==list.items.length||id===list.id||list.items.some((item,i)=>item.id===itemIds[i]))throw Error('Invalid quick-list copy');
  const copy={id,name,createdAt:stamp,updatedAt:stamp,items:list.items.map((item,i)=>({id:itemIds[i],text:item.text,done:false}))};
  if(!validQuickListsData({schema:1,lists:[copy]}))throw Error('Invalid quick-list copy');
  return copy;
}
