/** Read-only Restore preview. Never places archive contents in the page. */
const MODULES = Object.freeze([
  ['notes','notes'], ['tasksData','tasks'], ['calendarData','events'],
  ['quickListsData','lists'], ['bookmarksData','bookmarks'],
  ['rssData','rssArticles'], ['footballData','leagues']
]);
export function previewBackup(source, validated){
  const p=source?.data;
  if(!p||!validated||!Array.isArray(validated.notes))throw Error('Validate backup first');
  const counts={
    notes:validated.notes.length,
    tasks:validated.tasksData.tasks.length,
    events:validated.calendarData.events.length,
    lists:validated.quickListsData.lists.length,
    bookmarks:validated.bookmarksData.items.length,
    rssArticles:validated.rssData.articles.length,
    leagues:validated.footballData.leagues.length
  };
  const missing=MODULES.filter(([key])=>key!=='notes'&&!Object.hasOwn(p,key)).map(([key])=>key);
  const validDate=typeof source.createdAt==='string' && Number.isFinite(Date.parse(source.createdAt));
  return {counts, missing, createdAt:validDate?source.createdAt:null,
    version:typeof source.version==='string'?source.version.slice(0,40):null};
}
