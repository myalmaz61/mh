/**
 * v5.0 — capture the exact inventory of Notes crash-recovery drafts before
 * Restore. Draft contents never appear on screen, in JSON Backup or on GitHub.
 * No drafts are deleted or silently merged by this module.
 */
export function notesDraftInventory(store) {
  let state;
  try { state=store?.list?.(); }
  catch { state=null; }
  const unavailable=!state || state.unavailable===true;
  const drafts=Array.isArray(state?.drafts)?state.drafts:[];
  const corrupt=Number.isSafeInteger(state?.corrupt) && state.corrupt>=0 ? state.corrupt : 0;
  const tokens=drafts.map(record=>[String(record.key),String(record.raw)]).sort((a,b)=>a[0].localeCompare(b[0]));
  return {
    count:drafts.length,corrupt,unavailable,
    needsAcknowledgement:unavailable || drafts.length>0 || corrupt>0,
    fingerprint:JSON.stringify({unavailable,corrupt,tokens})
  };
}
export function sameNotesDraftInventory(a,b) {
  return Boolean(a && b && a.fingerprint===b.fingerprint);
}

/** v6.7 — one read-only overview of ALL emergency drafts before a Restore.
 * The fingerprint is internal only: never render, log, export, or send it.
 * No stored draft is removed, changed or copied to the backup.
 */
export function allRecoveryDraftInventory({notesStore,formStore,quickStore}={}) {
  const safeList=(store,kind)=>{
    try {
      const value=kind===undefined ? store?.list?.() : store?.list?.(kind);
      if(!value || value.unavailable===true || !Array.isArray(value.drafts) ||
         !Number.isSafeInteger(value.corrupt) || value.corrupt<0) return {drafts:[],corrupt:0,unavailable:true};
      return {drafts:value.drafts,corrupt:value.corrupt,unavailable:false};
    }catch{return {drafts:[],corrupt:0,unavailable:true};}
  };
  const parts={
    notes:safeList(notesStore),
    tasks:safeList(formStore,'tasks'),
    calendar:safeList(formStore,'calendar'),
    quickLists:safeList(quickStore)
  };
  const summary={};
  const fingerprints={};
  for(const [kind,item] of Object.entries(parts)) {
    summary[kind]={count:item.drafts.length,corrupt:item.corrupt,unavailable:item.unavailable};
    fingerprints[kind]={corrupt:item.corrupt,unavailable:item.unavailable,
      tokens:item.drafts.map(d=>[String(d.key),String(d.raw)]).sort((a,b)=>a[0].localeCompare(b[0]))};
  }
  const count=Object.values(summary).reduce((total,item)=>total+item.count,0);
  const corrupt=Object.values(summary).reduce((total,item)=>total+item.corrupt,0);
  const unavailable=Object.values(summary).some(item=>item.unavailable);
  return {byKind:summary,count,corrupt,unavailable,
    needsAcknowledgement:count>0||corrupt>0||unavailable,
    fingerprint:JSON.stringify(fingerprints)};
}
export function sameRecoveryDraftInventory(a,b){
  return Boolean(a && b && typeof a.fingerprint==='string' && a.fingerprint===b.fingerprint);
}
