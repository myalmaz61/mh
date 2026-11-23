/** MyHub 2.5.0 — optional, independent football result source.
 * Published SportScore API: https://sportscore.com/developers/api/
 * A second source never silently modifies OpenLigaDB fixtures or favourites.
 */
export const SECOND_SOURCE_NAME='SportScore';
export const SECOND_SOURCE_BASE='https://sportscore.com/api/v1/fixtures/';
export const SECOND_SOURCE_MIN_REFRESH_MS=5*60_000;
export const SECOND_SOURCE_MAX_RESULTS=200;
const isoDay=/^\d{4}-\d{2}-\d{2}$/;
export function isValidFootballDay(day){
  if(typeof day!=='string'||!isoDay.test(day))return false;
  const dt=new Date(`${day}T00:00:00Z`);
  return Number.isFinite(dt.getTime())&&dt.toISOString().slice(0,10)===day;
}
export function dayUtc(daysBack=0,now=new Date()){
  const date=new Date(now.getTime());date.setUTCDate(date.getUTCDate()-daysBack);
  return date.toISOString().slice(0,10);
}
export function sportScoreDayUrl(day){
  if(!isValidFootballDay(day))throw Error('Invalid date');
  const url=new URL(SECOND_SOURCE_BASE);
  url.searchParams.set('sport','football');url.searchParams.set('date',day);url.searchParams.set('limit',String(SECOND_SOURCE_MAX_RESULTS));
  return url.href;
}
const safeName=v=>typeof v==='string'?v.trim().slice(0,120):'';
const teamName=v=>safeName(typeof v==='string'?v:v?.name??v?.strTeam??v?.shortName);
const score=v=>{
  if(typeof v==='number')return Number.isInteger(v)&&v>=0&&v<=99?v:null;
  if(typeof v==='string'&&/^\d{1,2}$/.test(v))return Number(v);
  return null;
};
const readTime=v=>{
  if(typeof v!=='string'||v.length>45)return null;
  const millis=Date.parse(v);
  return Number.isFinite(millis)?new Date(millis).toISOString():null;
};
function classifyStatus(v){
  const raw=String(typeof v==='string'?v:v?.short??v?.code??v?.name??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  if(['finished','complete','completed','closed','ft','full_time','final','aet','after_extra_time','pen','after_penalties'].includes(raw))return 'finished';
  if(['live','in_progress','inplay','in_play','1h','2h','ht','half_time','et','extra_time'].includes(raw))return 'live';
  return 'unconfirmed';
}
/** Decode the documented day-fixtures envelope. Unknown shapes fail closed.
 * Source status controls whether a score may be labelled final.
 */
export function parseSportScoreFixtures(payload){
  const array=Array.isArray(payload)?payload:payload?.matches??payload?.fixtures??payload?.results??payload?.data?.matches;
  if(!Array.isArray(array)||array.length>3000)throw Error('Unexpected SportScore format');
  const seen=new Set(),rows=[];
  for(const item of array){
    if(!item||typeof item!=='object')continue;
    const home=teamName(item.home??item.home_team??item.homeTeam??item.strHomeTeam);
    const away=teamName(item.away??item.away_team??item.awayTeam??item.strAwayTeam);
    if(!home||!away||home===away)continue;
    const status=classifyStatus(item.status??item.match_status??item.state??item.strStatus);
    const homeScore=score(item.home_score??item.homeScore??item.intHomeScore??item.score?.home);
    const awayScore=score(item.away_score??item.awayScore??item.intAwayScore??item.score?.away);
    const time=readTime(item.time??item.start_time??item.kickoff??item.utc_date??item.dateEvent??'');
    const name=safeName(item.competition?.name??item.competition??item.league?.name??item.league??item.strLeague);
    const key=[time||'',home.toLowerCase(),away.toLowerCase()].join('|');
    if(seen.has(key))continue;seen.add(key);
    rows.push({home,away,status,homeScore,awayScore,time,competition:name});
    if(rows.length>=SECOND_SOURCE_MAX_RESULTS)break;
  }
  // No published score is invented, especially for unknown match statuses.
  return rows.sort((a,b)=>(a.time||'').localeCompare(b.time||''));
}
export function sportScoreFiltered(matches,search=''){
  if(!Array.isArray(matches))return [];
  const query=String(search).trim().toLocaleLowerCase();
  return matches.filter(x=>!query||`${x.home} ${x.away} ${x.competition}`.toLocaleLowerCase().includes(query)).slice(0,80);
}
export function sportScoreShownScore(m){
  if((m.status==='finished'||m.status==='live')&&Number.isInteger(m.homeScore)&&Number.isInteger(m.awayScore))
    return `${m.homeScore} : ${m.awayScore}`;
  return '– : –';
}
