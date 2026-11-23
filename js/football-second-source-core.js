/** MyHub 2.7.0 — optional second source, with accurate EPL slug and transparent diagnostics.
 * SportScore documents competition=<slug> for its date-scoped fixtures endpoint.
 * We never merge unverified matches into OpenLigaDB or the user's favourites.
 * https://sportscore.com/developers/api/
 */
export const SECOND_SOURCE_NAME='SportScore';
export const SECOND_SOURCE_BASE='https://sportscore.com/api/v1/fixtures/';
export const SECOND_SOURCE_PREMIER_LEAGUE='english-premier-league';
export const SECOND_SOURCE_PREMIER_LEAGUE_SITE_ID='jednm9whz0ryox8';
export const SECOND_SOURCE_PREMIER_LEAGUE_WEB='https://sportscore.com/football/competition/england/english-premier-league/jednm9whz0ryox8/';
export const SECOND_SOURCE_COMPETITIONS=Object.freeze([
  {id:SECOND_SOURCE_PREMIER_LEAGUE,title:'English Premier League'},
  {id:'',title:'All leagues'},
]);
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
export function lastSaturdayUtc(now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Invalid date');
  return dayUtc((now.getUTCDay()+1)%7,now);
}
export function validSportScoreCompetition(value){
  return SECOND_SOURCE_COMPETITIONS.some(item=>item.id===value);
}
/** Attempts are sequential and only run when previous API data is empty/unusable.
 * The public API does not guarantee all results that appear on the website.
 * An unfiltered attempt may miss EPL due to the global 200-match cap.
 */
export function sportScoreQueryPlan(day,competition=''){
  if(!isValidFootballDay(day)||!validSportScoreCompetition(competition))throw Error('Invalid date/competition');
  if(!competition)return [{label:'All leagues',url:sportScoreDayUrl(day,'')}];
  const siteId=SECOND_SOURCE_PREMIER_LEAGUE_SITE_ID;
  return [
    {label:'EPL slug',url:sportScoreDayUrl(day,competition)},
    {label:'EPL site ID',url:sportScoreDayUrl(day,siteId)},
    {label:'All leagues fallback (limited)',url:sportScoreDayUrl(day,'')},
  ];
}

/** A server-side competition filter is necessary: the unfiltered response is capped
 * at 200 games worldwide, so local text search cannot reliably find EPL games.
 */
export function sportScoreDayUrl(day,competition=''){
  if(!isValidFootballDay(day))throw Error('Invalid date');
  if(!validSportScoreCompetition(competition)&&competition!==SECOND_SOURCE_PREMIER_LEAGUE_SITE_ID)throw Error('Unknown competition');
  const url=new URL(SECOND_SOURCE_BASE);
  url.searchParams.set('sport','football');
  url.searchParams.set('date',day);
  url.searchParams.set('limit',String(SECOND_SOURCE_MAX_RESULTS));
  if(competition)url.searchParams.set('competition',competition);
  return url.href;
}
const safeName=v=>typeof v==='string'?v.trim().slice(0,120):'';
const teamName=v=>safeName(typeof v==='string'?v:v?.name??v?.strTeam??v?.shortName??v?.short_name??v?.title??v?.team_name);
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
/** Fail closed for unfamiliar envelopes and never invent a full-time score. */
export function parseSportScoreFixtures(payload){
  const array=Array.isArray(payload)?payload:payload?.matches??payload?.fixtures??payload?.results??payload?.events??payload?.items??payload?.data?.matches??payload?.data?.fixtures??payload?.data?.results??payload?.data?.items??payload?.data;
  if(!Array.isArray(array)||array.length>3000)throw Error('Unexpected SportScore format');
  const seen=new Set(),rows=[];
  for(const item of array){
    if(!item||typeof item!=='object')continue;
    const home=teamName(item.home??item.home_team??item.homeTeam??item.strHomeTeam??item.teams?.home);
    const away=teamName(item.away??item.away_team??item.awayTeam??item.strAwayTeam??item.teams?.away);
    if(!home||!away||home===away)continue;
    const status=classifyStatus(item.status??item.match_status??item.state??item.strStatus);
    const homeScore=score(item.home_score??item.homeScore??item.intHomeScore??item.score?.home??item.scores?.home);
    const awayScore=score(item.away_score??item.awayScore??item.intAwayScore??item.score?.away??item.scores?.away);
    const time=readTime(item.time??item.start_time??item.kickoff??item.utc_date??item.dateEvent??'');
    const name=safeName(item.competition?.name??item.competition?.title??item.competition??item.league?.name??item.league??item.strLeague);
    const competitionId=safeName(item.competition?.slug??item.competition?.id??item.league?.slug??item.league?.id??'');
    const country=safeName(item.competition?.country?.name??item.competition?.country??item.league?.country?.name??item.league?.country??item.country?.name??item.country??'');
    const key=[time||'',home.toLowerCase(),away.toLowerCase()].join('|');
    if(seen.has(key))continue;seen.add(key);
    rows.push({home,away,status,homeScore,awayScore,time,competition:name,competitionId,country});
    if(rows.length>=SECOND_SOURCE_MAX_RESULTS)break;
  }
  return rows.sort((a,b)=>(a.time||'').localeCompare(b.time||''));
}
/** Defence if an upstream server ignores a competition query. Without league
 * metadata there is no safe independent test; the UI states the API limitation.
 */
export function sportScoreForCompetition(matches,competition='',fromUnfiltered=false){
  if(!Array.isArray(matches)||!validSportScoreCompetition(competition))return [];
  if(!competition)return matches;
  return matches.filter(m=>{
    const name=String(m.competition||'').toLowerCase().replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();
    const code=String(m.competitionId||'').toLowerCase();
    const country=String(m.country||'').toLowerCase();
    if(/\bwomen|\bwsl|\bfeminine|\bfemale/.test(name))return false;
    if(code===SECOND_SOURCE_PREMIER_LEAGUE||code===SECOND_SOURCE_PREMIER_LEAGUE_SITE_ID)return true;
    if(/\b(english|england) premier league\b/.test(name))return true;
    if(/\bpremier league\b/.test(name)&&/england|english/.test(country))return true;
    // A league name alone can also occur in other countries. Only trust a
    // generic 'Premier League' when the server was explicitly asked for EPL.
    if(!fromUnfiltered&&/^(?:premier league|epl)(?: \d{4}(?:[\/-]\d{2,4})?)?$/.test(name))return true;
    // When the server supplied no competition metadata, its explicit filter
    // is the only evidence. Do not do this for the worldwide fallback.
    return !fromUnfiltered&&!name&&!code;
  });
}
export function sportScoreResponseDiagnostic(payload){
  const raw=Array.isArray(payload)?payload:payload?.matches??payload?.fixtures??payload?.results??payload?.events??payload?.items??payload?.data?.matches??payload?.data?.fixtures??payload?.data?.results??payload?.data?.items??payload?.data;
  return {topLevelKeys:payload&&typeof payload==='object'&&!Array.isArray(payload)?Object.keys(payload).slice(0,12):[],
    rawCount:Array.isArray(raw)?raw.length:null};
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
