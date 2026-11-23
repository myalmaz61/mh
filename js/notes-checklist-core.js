/** Conservative, pure helpers for checklist editing. All-or-nothing validation.
 * These operate on note items only; the caller performs the usual debounced save.
 */
export const MAX_CHECKLIST_ROWS = 300;
export const MAX_CHECKLIST_PASTE = 100;
export const MAX_CHECKLIST_PASTE_CHARS = 12000;

export function parseChecklistBatch(raw, currentCount = 0) {
  if (typeof raw !== 'string' || raw.length > MAX_CHECKLIST_PASTE_CHARS ||
      !Number.isInteger(currentCount) || currentCount < 0 || currentCount > MAX_CHECKLIST_ROWS) {
    throw Error('invalid-batch');
  }
  const lines = raw.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw Error('empty-batch');
  if (lines.length > MAX_CHECKLIST_PASTE ||
      currentCount + lines.length > MAX_CHECKLIST_ROWS) throw Error('batch-limit');
  if (lines.some(line => line.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(line))) {
    throw Error('invalid-batch');
  }
  return lines;
}

export function setChecklistCompletion(items, done) {
  if (!Array.isArray(items) || items.length > MAX_CHECKLIST_ROWS || typeof done !== 'boolean' ||
      items.some(item => !item || typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.done !== 'boolean')) {
    throw Error('invalid-checklist');
  }
  return items.map(item => ({...item, done}));
}

export function checklistProgress(items) {
  if (!Array.isArray(items)) return {done:0,total:0};
  return {done:items.filter(row=>row?.done===true).length,total:items.length};
}
