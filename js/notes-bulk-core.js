/** Plan a safe, non-mutating category change for a bounded group of Notes. */
import { validStoredNote } from './notes-trash-core.js';
import { validNoteCategory, categoryName } from './notes-category-core.js';
import { safeClone } from './utils.js';
export const MAX_BULK_NOTES = 100;
export function planBulkCategoryChange(expectedNotes, category, updatedAt) {
  if (!Array.isArray(expectedNotes) || expectedNotes.length < 1 || expectedNotes.length > MAX_BULK_NOTES) throw Error('Invalid selection size');
  if (typeof category !== 'string' || !validNoteCategory(category)) throw Error('Invalid category');
  const normalised = categoryName(category);
  if (!validNoteCategory(normalised)) throw Error('Invalid category');
  if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) throw Error('Invalid timestamp');
  const seen = new Set();
  return expectedNotes.map(note => {
    if (!validStoredNote(note) || seen.has(note.id)) throw Error('Invalid or repeated note');
    seen.add(note.id);
    return {...safeClone(note), category: normalised, updatedAt};
  });
}
