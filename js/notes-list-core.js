/** Bounded list presentation: keeps IndexedDB and filter results intact. */
export const NOTES_PAGE_SIZE = 40;
export function sliceNotesPage(items, limit = NOTES_PAGE_SIZE) {
  if (!Array.isArray(items)) return [];
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : NOTES_PAGE_SIZE;
  return items.slice(0, Math.min(safeLimit, items.length));
}
export function nextNotesPageLimit(limit, total) {
  const safeTotal = Number.isSafeInteger(total) && total > 0 ? total : 0;
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : NOTES_PAGE_SIZE;
  return Math.min(safeTotal, safeLimit + NOTES_PAGE_SIZE);
}
