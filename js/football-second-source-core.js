/** MyHub 2.6.0 — optional second source, with an explicit Premier League view.
 * SportScore documents competition=<slug> for its date-scoped fixtures endpoint.
 * We never merge unverified matches into OpenLigaDB or the user's favourites.
 * https://sportscore.com/developers/api/
 */
export const SECOND_SOURCE_NAME='SportScore';
export const SECOND_SOURCE_BASE='https://sportscore.com/api/v1/fixtures/';
export const SECOND_SOURCE_PREMIER_LEAGUE='premier-league';
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
/** A server-side competition filter is necessary: the unfiltered response is capped
 * at 200 games worldwide, so local text search cannot reliably find EPL games.
 */
export function sportScoreDayUrl(day,competition=''){
  if(!isValidFootballDay(day))throw Error('Invalid date');
  if(!validSportScoreCompetition(competition))throw Error('Unknown competition');
  const url=new URL(SECOND_SOURCE_BASE);
  url.searchParams.set('sport','football');
  url.searchParams.set('date',day);
  url.searchParams.set('limit',String(SECOND_SOURCE_MAX_RESULTS));
  if(competition)url.searchParams.set('competition',competition);
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
/** Fail closed for unfamiliar envelopes and never invent a full-time score. */
export function parseSportScoreFixtures(payload){
  const array=Array.isArray(payload)?payload:payload?.matches??payload?.fixtures??payload?.results??payload?.data?.matches??payload?.data;
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
  return rows.sort((a,b)=>(a.time||'').localeCompare(b.time||''));
}
/** Defence if an upstream server ignores a competition query. Without league
 * metadata there is no safe independent test; the UI states the API limitation.
 */
export function sportScoreForCompetition(matches,competition=''){
  if(!Array.isArray(matches)||!validSportScoreCompetition(competition))return [];
  if(!competition)return matches;
  return matches.filter(m=>{
    if(!m.competition)return true; // rely on the API's competition= filter if name is absent
    const label=String(m.competition).trim().toLowerCase().replace(/[-_]/g,' ').replace(/[^a-z ]/g,' ').replace(/\s+/g,' ');
    return ['english premier league','premier league','england premier league','premier league england','epl'].includes(label);
  });
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
