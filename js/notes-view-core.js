/** Pure, non-mutating list organisation for Notes. Pins remain first in every order. */
import {categoryName} from './notes-category-core.js';
export function selectNotes(notes, {query = '', scope = 'all', order = 'newest', locale = 'bg-BG', category = '*'} = {}) {
  if (!Array.isArray(notes)) return [];
  const text = String(query).trim().toLocaleLowerCase();
  const selectedScope = ['all', 'pinned', 'favourites'].includes(scope) ? scope : 'all';
  const selectedOrder = ['newest', 'oldest', 'title'].includes(order) ? order : 'newest';
  const filtered = notes.filter(note => {
    if (!note || typeof note.title !== 'string' || typeof note.body !== 'string' || !Array.isArray(note.items)) return false;
    if (selectedScope === 'pinned' && !note.pinned) return false;
    if (selectedScope === 'favourites' && !note.favourite) return false;
    if (category!=='*' && categoryName(note.category).toLocaleLowerCase() !== String(category).toLocaleLowerCase()) return false;
    return !text || [note.title, note.body, categoryName(note.category), ...note.items.map(item => typeof item?.text === 'string' ? item.text : '')]
      .join(' ').toLocaleLowerCase().includes(text);
  });
  const changedAt = note => Number.isFinite(Date.parse(note.updatedAt)) ? Date.parse(note.updatedAt) : 0;
  return filtered.sort((a, b) => {
    const pinDifference = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDifference) return pinDifference;
    if (selectedOrder === 'title') {
      const titleDifference = a.title.localeCompare(b.title, locale, {sensitivity:'base', numeric:true});
      if (titleDifference) return titleDifference;
    } else {
      const dateDifference = changedAt(b) - changedAt(a);
      if (dateDifference) return selectedOrder === 'oldest' ? -dateDifference : dateDifference;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}
