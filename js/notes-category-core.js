/** Optional per-note categories: old notes remain valid without this field. */
export const MAX_NOTE_CATEGORY_LENGTH=40;
export function validNoteCategory(value) {
  return value===undefined || (typeof value==='string' && value.length<=MAX_NOTE_CATEGORY_LENGTH && !/[\u0000-\u001f\u007f]/.test(value));
}
export function categoryName(value) {
  return validNoteCategory(value) ? String(value ?? '').trim().replace(/\s+/g,' ') : '';
}
export function noteCategories(notes,locale='bg-BG') {
  if(!Array.isArray(notes))return [];
  const names=new Map();
  for(const n of notes){
    const name=categoryName(n?.category);
    if(name && !names.has(name.toLocaleLowerCase()))names.set(name.toLocaleLowerCase(),name);
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b,locale,{sensitivity:'base'}));
}
