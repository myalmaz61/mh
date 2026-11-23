/** One-tap pin/favourite action; preserve the rest of a note unchanged. */
import { validStoredNote } from './notes-trash-core.js';
import { safeClone } from './utils.js';
export const QUICK_FLAGS = Object.freeze(['pinned','favourite']);
export function planNoteQuickToggle(note, flag, timestamp) {
  if (!validStoredNote(note) || !QUICK_FLAGS.includes(flag)) throw Error('Invalid note or quick action');
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw Error('Invalid timestamp');
  const copy=safeClone(note);
  copy[flag]=!copy[flag];
  copy.updatedAt=timestamp;
  return copy;
}
