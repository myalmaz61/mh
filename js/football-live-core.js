/** MyHub v5.2.0 — pure presentation rules for SportScore live/recent matches.
 * SportScore's /api/widget/matches/ endpoint publishes a small, limited list,
 * NOT an exhaustive global list and NOT a guaranteed real-time score feed.
 * Do not merge provider IDs, statuses or scores into OpenLigaDB storage.
 */
export const FOOTBALL_LIVE_URL='https://sportscore.com/api/widget/matches/?sport=football&limit=50';
export const FOOTBALL_LIVE_MIN_REFRESH_MS=2*60_000;
export const FOOTBALL_LIVE_STALE_MS=5*60_000;
export const FOOTBALL_LIVE_MAX_ITEMS=50;
export const FOOTBALL_LIVE_MAX_DISPLAY=35;

export function footballLiveSummary(rows){
  if(!Array.isArray(rows))return {total:0,live:0,finished:0,unconfirmed:0};
  return {total:rows.length,live:rows.filter(m=>m?.status==='live').length,
    finished:rows.filter(m=>m?.status==='finished').length,
    unconfirmed:rows.filter(m=>m?.status!=='live'&&m?.status!=='finished').length};
}
export function footballLiveVisible(rows,{query='',onlyLive=false,limit=FOOTBALL_LIVE_MAX_DISPLAY}={}){
  if(!Array.isArray(rows))return [];
  const needle=String(query).trim().toLocaleLowerCase();
  const rank=s=>s==='live'?0:s==='unconfirmed'?1:2;
  // Work on a copy; rendering a filter should never modify the last good result.
  return rows.filter(m=>m&&typeof m.home==='string'&&typeof m.away==='string'&&
    (!onlyLive||m.status==='live')&&
    (!needle||`${m.home} ${m.away} ${m.competition||''}`.toLocaleLowerCase().includes(needle)))
    .sort((a,b)=>rank(a.status)-rank(b.status)||String(a.time||'').localeCompare(String(b.time||'')))
    .slice(0,Math.max(0,Math.min(FOOTBALL_LIVE_MAX_DISPLAY,Number.isFinite(limit)?Math.floor(limit):FOOTBALL_LIVE_MAX_DISPLAY)));
}
export function footballLiveFreshness(checkedAt,now=Date.now()){
  if(!Number.isFinite(checkedAt)||checkedAt<=0)return {minutes:null,stale:true};
  const age=Math.max(0,now-checkedAt);
  return {minutes:Math.floor(age/60_000),stale:age>=FOOTBALL_LIVE_STALE_MS};
}
