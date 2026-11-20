// MyHub Football v0.6 – pure data functions, independent of UI and network.
export const FOOTBALL_BASE='https://api.openligadb.de';
export const MAX_LEAGUES=6;
export const MAX_FOOTBALL_MATCHES=520;
export const MAX_CATALOG=400;
export const DEFAULT_FOOTBALL_LEAGUE=Object.freeze({key:'bl1|2026',shortcut:'bl1',season:'2026',name:'1. Fußball-Bundesliga 2026/27'});
const string=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max;
const goodId=v=>Number.isInteger(v)&&v>0&&v<1000000000;
const iso=v=>string(v,16,40)&&Number.isFinite(Date.parse(v));
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const leagueKey=(shortcut,season)=>`${shortcut}|${season}`;
export function validLeague(v){return plain(v)&&string(v.shortcut,1,36)&&/^[\p{L}0-9_.-]+$/u.test(v.shortcut)&&
  /^20\d{2}$/.test(v.season)&&string(v.name,1,110)&&v.key===leagueKey(v.shortcut,v.season);}
export function emptyFootballData(){return {schema:1,leagues:[{...DEFAULT_FOOTBALL_LEAGUE}],selected:DEFAULT_FOOTBALL_LEAGUE.key,favoriteTeams:[],cache:{}};}
export function validMatch(m){return plain(m)&&goodId(m.id)&&goodId(m.homeId)&&goodId(m.awayId)&&m.homeId!==m.awayId&&
  string(m.home,1,100)&&string(m.away,1,100)&&m.time!==null&&(iso(m.time))&&typeof m.finished==='boolean'&&
  (m.homeScore===null||(Number.isInteger(m.homeScore)&&m.homeScore>=0&&m.homeScore<=100))&&
  (m.awayScore===null||(Number.isInteger(m.awayScore)&&m.awayScore>=0&&m.awayScore<=100))&&
  (m.homeScore===null)===(m.awayScore===null)&&Number.isInteger(m.group)&&m.group>=0&&m.group<=1500;}
export function validFootballData(v){
  if(!plain(v)||v.schema!==1||!Array.isArray(v.leagues)||v.leagues.length<1||v.leagues.length>MAX_LEAGUES||
    v.leagues.some(l=>!validLeague(l))||new Set(v.leagues.map(l=>l.key)).size!==v.leagues.length||
    !string(v.selected,1,50)||!v.leagues.some(l=>l.key===v.selected)||
    !Array.isArray(v.favoriteTeams)||v.favoriteTeams.length>100||v.favoriteTeams.some(x=>!goodId(x))||
    new Set(v.favoriteTeams).size!==v.favoriteTeams.length||!plain(v.cache))return false;
  const keys=Object.keys(v.cache);
  if(keys.length>MAX_LEAGUES||keys.some(k=>!v.leagues.some(l=>l.key===k)))return false;
  for(const entry of Object.values(v.cache)){
    if(!plain(entry)||!iso(entry.fetchedAt)||!Array.isArray(entry.matches)||entry.matches.length>MAX_FOOTBALL_MATCHES||
      entry.matches.some(m=>!validMatch(m))||new Set(entry.matches.map(m=>m.id)).size!==entry.matches.length)return false;
  }
  return true;
}
export function leagueListFromAPI(payload,nowYear=new Date().getFullYear()){
  if(!Array.isArray(payload))throw Error('Invalid league response');
  const found=new Map();
  for(const item of payload){
    const season=String(item?.leagueSeason??'');
    const league={shortcut:item?.leagueShortcut,season,name:item?.leagueName,key:leagueKey(item?.leagueShortcut,season)};
    if(item?.sport?.sportId!==1||!validLeague(league))continue;
    const year=Number(season);
    if(year<nowYear-1||year>nowYear+1||found.has(league.key))continue;
    found.set(league.key,league);
    if(found.size>=MAX_CATALOG)break;
  }
  return [...found.values()].sort((a,b)=>Number(b.season)-Number(a.season)||a.name.localeCompare(b.name));
}
export function matchURL(league){if(!validLeague(league))throw Error('Invalid league');return `${FOOTBALL_BASE}/getmatchdata/${encodeURIComponent(league.shortcut)}/${league.season}`;}
const scoreFromAPI=(item)=>{
  const results=Array.isArray(item?.matchResults)?item.matchResults:[];
  const final=results.find(r=>r?.resultTypeID===2)||results.filter(r=>Number.isInteger(r?.resultOrderID)).sort((a,b)=>b.resultOrderID-a.resultOrderID)[0];
  if(Number.isInteger(final?.pointsTeam1)&&Number.isInteger(final?.pointsTeam2))return [final.pointsTeam1,final.pointsTeam2];
  // Goal entries are genuine published data; no zero-zero score is inferred if absent.
  const goals=Array.isArray(item?.goals)?item.goals:[];
  if(goals.length>0){
    const latest=goals[goals.length-1];
    if(Number.isInteger(latest?.scoreTeam1)&&Number.isInteger(latest?.scoreTeam2))return [latest.scoreTeam1,latest.scoreTeam2];
  }
  return [null,null];
};
export function parseMatches(payload){
  if(!Array.isArray(payload))throw Error('Невалиден отговор от OpenLigaDB / Invalid football data');
  if(payload.length>3000)throw Error('Too many matches');
  const seen=new Set(),result=[];
  for(const m of payload){
    const homeId=m?.team1?.teamId,awayId=m?.team2?.teamId;
    const time=m?.matchDateTimeUTC;
    const [homeScore,awayScore]=scoreFromAPI(m);
    const match={id:m?.matchID,homeId,awayId,home:String(m?.team1?.teamName??'').slice(0,100),away:String(m?.team2?.teamName??'').slice(0,100),
      time:typeof time==='string'?time:'',finished:m?.matchIsFinished===true,homeScore,awayScore,
      group:Number.isInteger(m?.group?.groupOrderID)?m.group.groupOrderID:0};
    if(validMatch(match)&&!seen.has(match.id)){result.push(match);seen.add(match.id);}
  }
  return result.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(0,MAX_FOOTBALL_MATCHES);
}
export function matchStatus(m,now=Date.now()){
  if(m.finished)return 'finished';
  const delta=now-Date.parse(m.time);
  if(delta<0)return 'scheduled';
  return delta<=3*60*60*1000?'possible':'unconfirmed';
}
export function visibleMatches(matches,filter='all',favoriteTeams=[],now=Date.now()){
  const seen=new Set();const list=matches.filter(m=>{if(!validMatch(m)||seen.has(m.id))return false;seen.add(m.id);return true;});
  const fav=new Set(favoriteTeams);
  const narrowed=list.filter(m=>filter==='favorites'?(fav.has(m.homeId)||fav.has(m.awayId)):
    filter==='finished'?m.finished:filter==='upcoming'?!m.finished:true);
  const past=narrowed.filter(m=>Date.parse(m.time)<now).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  const next=narrowed.filter(m=>Date.parse(m.time)>=now).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  if(filter==='finished')return past.slice(0,40);
  if(filter==='upcoming')return [...past.filter(m=>matchStatus(m,now)==='unconfirmed'||matchStatus(m,now)==='possible').slice(0,6),...next.slice(0,36)];
  return [...past.slice(0,16).reverse(),...next.slice(0,24)];
}
export function hasPossibleMatch(matches,now=Date.now()){return matches.some(m=>matchStatus(m,now)==='possible');}
