/** MyHub v6.2.0 — pure, per-city weather cache update.
 * Keep newer snapshots written by other tabs; never merge an obsolete entire
 * in-memory map over IndexedDB. No personal data or schema migration.
 */
export function weatherCachePatch(current, allowedIds, cityId, next, now=Date.now()) {
  if(!current || typeof current!=='object' || Array.isArray(current) ||
     !Array.isArray(allowedIds) || typeof cityId!=='string' || !cityId ||
     !Number.isFinite(now)) throw Error('Invalid weather cache update');
  const allowed=new Set(allowedIds);
  const result={};
  for(const [id,snapshot] of Object.entries(current)){
    if(allowed.has(id))result[id]=snapshot;
  }
  if(next===null){delete result[cityId];return result;}
  if(!allowed.has(cityId) || !next || typeof next!=='object')throw Error('Weather city is no longer saved');
  const incoming=Date.parse(next.fetchedAt);
  const old=Date.parse(result[cityId]?.fetchedAt ?? '');
  // Do not let an old request overwrite a newer forecast from another tab.
  // Ignore wildly future-dated cache timestamps (e.g. a phone clock change).
  if(Number.isFinite(old) && old>incoming && old<=now+5*60_000)return result;
  result[cityId]=next;
  return result;
}
