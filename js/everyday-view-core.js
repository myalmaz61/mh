/** MyHub v6.4 — validated, ephemeral view snapshots.
 * State lives only in the current JS process, never in URL/history, IndexedDB,
 * localStorage, service worker cache or JSON backups. No personal record IDs.
 */
export const SESSION_VIEWS = ['notes','search','football','weather'];
const FOLDS = new Set(['quick','week','hours','compare','compare-0','compare-1','metrics']);
export function safeSessionScroll(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(1_000_000,Math.floor(value)) : 0;
}
export function sanitiseSessionView(route,raw) {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
  if (route==='notes') {
    const search=typeof raw.search==='string'?raw.search.slice(0,200):'';
    const scope=['all','pinned','favourites'].includes(raw.scope)?raw.scope:'all';
    const order=['newest','oldest','title'].includes(raw.order)?raw.order:'newest';
    const category=typeof raw.category==='string'&&raw.category.length<=40?raw.category:'*';
    const limit=Number.isSafeInteger(raw.limit)&&raw.limit>=1?Math.min(raw.limit,2000):40;
    const templateQuery=typeof raw.templateQuery==='string'?raw.templateQuery.slice(0,100):'';
    return {search,scope,order,category,limit,templatePanelOpen:raw.templatePanelOpen===true,templateQuery};
  }
  if (route==='search') {
    const query=typeof raw.query==='string'?raw.query.slice(0,120):'';
    const category=['all','note','task','event','list','bookmark','tool'].includes(raw.category)?raw.category:'all';
    return {query,category,titlesOnly:raw.titlesOnly===true,sort:raw.sort==='newest'?'newest':'relevance'};
  }
  if (route==='football')return {tab:['today','all','upcoming','finished','favorites'].includes(raw.tab)?raw.tab:'today'};
  if (route==='weather')return {
    manageOpen:raw.manageOpen===true,
    manageQuery:typeof raw.manageQuery==='string'?raw.manageQuery.slice(0,70):'',
    folds:Array.isArray(raw.folds)?[...new Set(raw.folds.filter(value=>typeof value==='string'&&FOLDS.has(value)))]:[]
  };
  return null;
}
export function shouldRestoreSessionView(selection) {
  // An explicit record or date selection should open a fresh view at the top.
  return selection === null || selection === undefined;
}
