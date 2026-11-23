/** MyHub v2.4.0 — explain missing results without fabricating scores.
 * This module only reads existing match objects; no data migration required.
 */
import {FOOTBALL_BASE,validMatch} from './football-core.js';

export const MISSING_RESULT_AFTER_MS=6*60*60_000;
export const RECENT_RESULTS_WINDOW_MS=10*24*60*60_000;
export const SINGLE_MATCH_COOLDOWN_MS=2*60_000;

export function hasConfirmedResult(match){
  return Boolean(match?.finished===true && Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore));
}
export function needsResultCheck(match,now=Date.now()){
  if(!validMatch(match)||hasConfirmedResult(match))return false;
  const elapsed=now-Date.parse(match.time);
  return elapsed>=MISSING_RESULT_AFTER_MS;
}
export function footballResultHealth(matches,now=Date.now()){
  if(!Array.isArray(matches))return {unconfirmed:0,checked:0};
  let unconfirmed=0,checked=0;
  for(const match of matches){
    if(!validMatch(match))continue;
    const age=now-Date.parse(match.time);
    if(age<MISSING_RESULT_AFTER_MS||age>RECENT_RESULTS_WINDOW_MS)continue;
    checked++;
    if(!hasConfirmedResult(match))unconfirmed++;
  }
  return {unconfirmed,checked};
}
/** A shorter / temporarily incomplete season response must not discard prior entries.
 * Trust newer published scores, but keep a previously confirmed final score if the
 * current response unexpectedly loses that information.
 */
export function mergeFootballMatches(previous,received){
  if(!Array.isArray(previous)||!Array.isArray(received))throw Error('Invalid matches');
  const merged=new Map();
  for(const old of previous)if(validMatch(old))merged.set(old.id,old);
  for(const fresh of received){
    if(!validMatch(fresh))continue;
    const old=merged.get(fresh.id);
    if(!old){merged.set(fresh.id,fresh);continue;}
    if(hasConfirmedResult(old) && !hasConfirmedResult(fresh)){
      merged.set(fresh.id,{...fresh,finished:true,homeScore:old.homeScore,awayScore:old.awayScore});
    }else if(fresh.homeScore===null && old.homeScore!==null && fresh.finished===false){
      merged.set(fresh.id,{...fresh,homeScore:old.homeScore,awayScore:old.awayScore});
    }else{
      merged.set(fresh.id,fresh);
    }
  }
  return [...merged.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(-520);
}
export function singleFootballMatchURL(matchId){
  if(!Number.isSafeInteger(matchId)||matchId<=0||matchId>=1_000_000_000)throw Error('Invalid match ID');
  return `${FOOTBALL_BASE}/getmatchdata/${matchId}`;
}
/** An explicit external web search is a user choice, not a second API or a score. */
export function matchSearchURL(match){
  if(!validMatch(match))throw Error('Invalid match');
  const terms=`${match.home} ${match.away} football result ${match.time.slice(0,10)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}
