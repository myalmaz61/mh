/** Persistent, local-only Notes trash. Kept as one validated meta record.
 * Never prune automatically: users must explicitly make space before deleting.
 */
export const MAX_TRASH_NOTES = 100;
export const emptyNotesTrash = () => ({schema:1,items:[]});
const goodIso = x => typeof x === 'string' && x.length <= 32 && Number.isFinite(Date.parse(x));

export function validStoredNote(n) {
  if (!n || typeof n !== 'object' || Array.isArray(n) ||
      typeof n.id !== 'string' || n.id.length < 1 || n.id.length > 100 ||
      !['text','checklist'].includes(n.kind) ||
      typeof n.title !== 'string' || n.title.length > 200 ||
      typeof n.body !== 'string' || n.body.length > 100000 ||
      typeof n.pinned !== 'boolean' || typeof n.favourite !== 'boolean' ||
      !goodIso(n.createdAt) || !goodIso(n.updatedAt) ||
      !Array.isArray(n.items) || n.items.length > 300) return false;
  const ids=new Set();
  for (const row of n.items) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.id !== 'string' || row.id.length < 1 || row.id.length > 100 || ids.has(row.id) ||
        typeof row.text !== 'string' || row.text.length > 2000 || typeof row.done !== 'boolean') return false;
    ids.add(row.id);
  }
  return true;
}

export function validNotesTrash(value, activeIds=[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 1 ||
      !Array.isArray(value.items) || value.items.length > MAX_TRASH_NOTES) return false;
  const ids=new Set(activeIds);
  for (const entry of value.items) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        !goodIso(entry.deletedAt) || !validStoredNote(entry.note) || ids.has(entry.note.id)) return false;
    ids.add(entry.note.id);
  }
  return true;
}

export function summaryOfTrash(trash) {
  if (!validNotesTrash(trash)) throw Error('Invalid notes trash');
  return trash.items.length;
}
