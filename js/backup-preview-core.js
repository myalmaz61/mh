/** Read-only Restore preview. Never places archive contents in the page. */
const MODULES = Object.freeze([
  ['notes','notes'], ['notesTrashData','trashedNotes'], ['tasksData','tasks'], ['calendarData','events'],
  ['quickListsData','lists'], ['bookmarksData','bookmarks'],
  ['rssData','rssArticles'], ['footballData','leagues']
]);
export function previewBackup(source, validated){
  const p=source?.data;
  if(!p||!validated||!Array.isArray(validated.notes))throw Error('Validate backup first');
  const counts={
    notes:validated.notes.length,
    trashedNotes:validated.notesTrashData.items.length,
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

/**
 * Compare validated archive with current, validated local data. No writes.
 * Counts alone cannot detect replacements, so track record IDs and content too.
 * Nested checklist content and settings may also change; always warn before restore.
 */
export function compareBackupContents(current, incoming){
  if(!current || !incoming || !Array.isArray(current.notes) || !Array.isArray(incoming.notes))throw Error('Validate both datasets before comparison');
  const sections=[
    ['notes',current.notes,incoming.notes,'id'],
    ['trashedNotes',current.notesTrashData.items.map(x=>({...x,id:x.note.id})),incoming.notesTrashData.items.map(x=>({...x,id:x.note.id})),'id'],
    ['tasks',current.tasksData.tasks,incoming.tasksData.tasks,'id'],
    ['events',current.calendarData.events,incoming.calendarData.events,'id'],
    ['lists',current.quickListsData.lists,incoming.quickListsData.lists,'id'],
    ['bookmarks',current.bookmarksData.items,incoming.bookmarksData.items,'id'],
    ['rssArticles',current.rssData.articles,incoming.rssData.articles,'id'],
    ['leagues',current.footballData.leagues,incoming.footballData.leagues,'key']
  ];
  return sections.map(([key,oldItems,newItems,field])=>{
    const oldMap=new Map(oldItems.map(item=>[item[field],item]));
    const newMap=new Map(newItems.map(item=>[item[field],item]));
    const removed=[...oldMap.keys()].filter(id=>!newMap.has(id)).length;
    const added=[...newMap.keys()].filter(id=>!oldMap.has(id)).length;
    const changed=[...oldMap.keys()].filter(id=>newMap.has(id) && JSON.stringify(oldMap.get(id))!==JSON.stringify(newMap.get(id))).length;
    return {key,current:oldItems.length,incoming:newItems.length,removed,added,changed};
  });
}

/** Reminder is informational only; exported timestamp means prepared, not downloaded. */
export function backupReminderState(lastExportAt, days=14, now=Date.now()){
  if(![0,7,14,30].includes(days))throw Error('Invalid reminder interval');
  if(days===0)return {enabled:false,due:false,daysSince:null};
  const last=typeof lastExportAt==='string'?Date.parse(lastExportAt):NaN;
  const daysSince=Number.isFinite(last) && last<=now ? Math.floor((now-last)/86400000):null;
  return {enabled:true,due:daysSince===null||daysSince>=days,daysSince};
}
