/** Pure helper functions for everyday note actions. */
export function plainNoteText(note) {
  if (!note || (note.kind !== 'text' && note.kind !== 'checklist')) throw Error('Invalid note');
  const title = typeof note.title === 'string' ? note.title.trim() : '';
  if (note.kind === 'text') {
    if (typeof note.body !== 'string') throw Error('Invalid note body');
    return [title, note.body].filter(Boolean).join('\n\n');
  }
  if (!Array.isArray(note.items) || note.items.some(row => !row || typeof row.text !== 'string' || typeof row.done !== 'boolean')) throw Error('Invalid checklist');
  return [title, ...note.items.map(row => `${row.done ? '[x]' : '[ ]'} ${row.text}`)].filter(Boolean).join('\n');
}
export function duplicateNoteData(note, newId, newItemId, timestamp, suffix = ' (копие)') {
  if (!note || !['text','checklist'].includes(note.kind) || typeof note.title !== 'string' || typeof note.body !== 'string' || !Array.isArray(note.items) || note.items.length > 300 ||
    note.items.some(row => !row || typeof row.text !== 'string' || typeof row.done !== 'boolean') || typeof newId !== 'string' || newId.length < 1 ||
    typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw Error('Invalid note for duplicate');
  return {
    id:newId,kind:note.kind,title:(note.title.slice(0,Math.max(0,200-suffix.length))+suffix).slice(0,200),
    body:note.body,items:note.items.map(row => ({id:newItemId(),text:row.text,done:row.done})),
    category:typeof note.category==='string' ? note.category : '',
    pinned:false,favourite:false,createdAt:timestamp,updatedAt:timestamp,
  };
}
