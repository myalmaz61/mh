/** v6.9.0 — read-only editor status helpers. No data writes or schema changes. */
export function hasPendingChecklistInput(single='',batch='') {
  return [single,batch].some(value => typeof value==='string' && value.trim().length>0);
}
/** Distinguish persisted note edits from text not yet added to a checklist. */
export function noteEditorSaveUi(state={},pendingInput=false) {
  const dirty=Boolean(state?.dirty);
  const saving=Boolean(state?.saving);
  const error=Boolean(state?.error);
  return {
    status:error?'error':pendingInput?'pending':(dirty||saving?'saving':'saved'),
    showSave:dirty||Boolean(pendingInput),
    disableSave:saving,
  };
}
export function isNoteSaveShortcut(event) {
  return Boolean(event && typeof event.key==='string' &&
    event.key.toLowerCase()==='s' && (event.ctrlKey||event.metaKey) &&
    !event.altKey && !event.shiftKey);
}
