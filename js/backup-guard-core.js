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
