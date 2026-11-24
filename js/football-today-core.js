/** MyHub 4.8: presentation-only football helpers. Never modify stored fixtures. */
import {matchRefreshPhase} from './football-refresh-core.js';

/** The OpenLigaDB "today" tab follows the phone's calendar, not a UTC day. */
export function footballLocalDay(value, timeZone){
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  if(timeZone){
    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone,year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(date);
    const pick=type=>parts.find(part=>part.type===type)?.value||'';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function footballTodayMatches(matches,now=new Date(),timeZone){
  if(!Array.isArray(matches))return [];
  const day=footballLocalDay(now,timeZone);
  if(!day)return [];
  return matches.filter(m=>m&&footballLocalDay(m.time,timeZone)===day)
    .sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}
/** A network fetch timestamp is not proof that the match score itself is fresh. */
export function footballSnapshotRecency(snapshot,now=Date.now()){
  const fetched=Date.parse(snapshot?.fetchedAt||'');
  if(!Number.isFinite(fetched))return {minutes:null,stale:false,phase:'unknown'};
  const minutes=Math.max(0,Math.floor((now-fetched)/60_000));
  const phase=matchRefreshPhase(snapshot?.matches||[],now);
  const staleAfter=phase==='active'?10:phase==='near'?30:240;
  return {minutes,stale:minutes>=staleAfter,phase};
}
