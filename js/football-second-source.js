/** SportScore panel: independent, day-scoped Premier League results.
 * Does not alter the OpenLigaDB league catalogue, cache or favourites.
 */
import {escapeHtml} from './utils.js';
import {dayUtc,lastSaturdayUtc,isValidFootballDay,sportScoreDayUrl,parseSportScoreFixtures,
  sportScoreFiltered,sportScoreForCompetition,sportScoreShownScore,validSportScoreCompetition,sportScoreQueryPlan,sportScoreResponseDiagnostic,
  SECOND_SOURCE_PREMIER_LEAGUE,SECOND_SOURCE_MIN_REFRESH_MS,sportScoreSourceView} from './football-second-source-core.js';
import {sportScoreDayOnReturn} from './foreground-refresh-core.js';

export function mountFootballSecondSource({element,t,lang}){
  const select=element.querySelector('#football-second-date');
  const competition=element.querySelector('#football-second-competition');
  const search=element.querySelector('#football-second-search');
  const results=element.querySelector('#football-second-results');
  const message=element.querySelector('#football-second-message');
  const debug=element.querySelector('#football-second-debug');
  const apiLink=element.querySelector('#football-second-api-link');
  const toggle=element.querySelector('#football-second-details');
  const refresh=element.querySelector('#football-second-refresh');
  let day=dayUtc(0),dead=false,busy=false,controller=null,current=[],loadedKey='',lastFetched=0,requestId=0,viaGlobal=false;
  let followToday=true,lastKnownToday=dayUtc(0),lastWarning='';
  // Choose EPL by default: the user should not need to 'add' it via OpenLigaDB.
  competition.value=SECOND_SOURCE_PREMIER_LEAGUE;
  select.value=day;
  select.max=dayUtc(0);
  const selectionKey=()=>`${select.value}|${competition.value}`;
  const checked=element.querySelector('#football-second-updated');
  function paint(){
    const checkState=sportScoreSourceView(null,lastFetched);
    checked.textContent=loadedKey&&lastFetched?`${t('footballSecondChecked')}: ${new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(lastFetched))} · ${t('footballSecondSource')}${checkState.minutes===null?'':` · ${t('footballMinutesAgo').replace('{n}',String(checkState.minutes))}`}${checkState.stale?' · '+t('footballLiveOld'):''}`:'';
    if(!loadedKey){results.innerHTML='';message.textContent=lastWarning;return;}
    const filtered=sportScoreForCompetition(current,competition.value,viaGlobal);
    const found=sportScoreFiltered(filtered,search.value);
    results.innerHTML=found.length?found.map(m=>{
      const score=escapeHtml(sportScoreShownScore(m));
      const status=t(sportScoreSourceView(m,lastFetched).labelKey);
      const when=m.time?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(m.time))+' UTC':'';
      return `<article class="football-second-match"><div class="muted football-second-meta">${escapeHtml(m.competition||'')} ${escapeHtml(when)} · ${escapeHtml(status)}</div>
        <div class="football-second-line"><span>${escapeHtml(m.home)} – ${escapeHtml(m.away)}</span><strong>${score}</strong></div></article>`;
    }).join(''):`<p class="muted">${t('footballSecondEmpty')}</p>`;
    message.textContent=busy?t('weatherLoading'):
      `${t('footballSecondShown')}: ${found.length}${filtered.length>80?' · '+t('footballSecondLimit'):''}${lastWarning?' · '+lastWarning:''}`;
  }
  async function load(force=false){
    if(dead||busy)return;
    select.max=dayUtc(0);
    day=select.value;
    if(!isValidFootballDay(day)||day>dayUtc(0)){lastWarning=t('footballSecondBadDay');paint();return;}
    if(!validSportScoreCompetition(competition.value)){lastWarning=t('footballSecondError');paint();return;}
    if(!navigator.onLine){lastWarning=t('footballSecondOffline');paint();return;}
    const key=selectionKey();
    debug.textContent='';
    apiLink.href=sportScoreDayUrl(day,competition.value);
    if(loadedKey===key&&Date.now()-lastFetched<SECOND_SOURCE_MIN_REFRESH_MS){
      if(force)lastWarning=t('footballSecondLimited');paint();return;
    }
    busy=true;refresh.disabled=true;lastWarning='';message.textContent=t('weatherLoading');
    controller?.abort();const thisController=new AbortController();controller=thisController;const thisRequest=++requestId;
    const timeout=setTimeout(()=>thisController.abort(),16000);
    try{
      const attempts=[];let found=[],chosen=[],chosenGlobal=false,succeeded=false;
      for(const [index,option] of sportScoreQueryPlan(day,competition.value).entries()){
        if(dead||thisController.signal.aborted||thisRequest!==requestId||selectionKey()!==key)return;
        try{
          const response=await fetch(option.url,{signal:thisController.signal,headers:{Accept:'application/json'},cache:'no-store'});
          if(!response.ok){
            attempts.push(`${index+1}. ${option.label}: HTTP ${response.status}`);
            if(response.status===429)throw Error('API rate limit (429)');
            continue;
          }
          const payload=await response.json();
          const info=sportScoreResponseDiagnostic(payload);
          let rows;
          try{rows=parseSportScoreFixtures(payload);}
          catch(err){attempts.push(`${index+1}. ${option.label}: ${String(err.message)} · keys=${info.topLevelKeys.join(',')}`);continue;}
          const unfiltered=index>0&&option.label.startsWith('All leagues');
          const matches=sportScoreForCompetition(rows,competition.value,unfiltered);
          attempts.push(`${index+1}. ${option.label}: HTTP 200 · raw=${info.rawCount??'?'} · parsed=${rows.length} · EPL=${matches.length}`);
          succeeded=true;
          if(matches.length){found=matches;chosen=rows;chosenGlobal=unfiltered;break;}
        }catch(err){
          if(thisController.signal.aborted)throw err;
          if(String(err.message).includes('rate limit'))throw err;
          attempts.push(`${index+1}. ${option.label}: ${String(err.message).slice(0,90)}`);
        }
      }
      if(dead||thisRequest!==requestId||selectionKey()!==key)return;
      debug.textContent=[`${day} · ${new Date().toISOString()}`,...attempts].join('\n');
      const hadMatches=loadedKey===key&&sportScoreForCompetition(current,competition.value,viaGlobal).length>0;
      // A failed/empty provider refresh must not erase previous matches or
      // pretend the old snapshot was checked successfully just now.
      if(!succeeded){
        lastWarning=t('footballSecondError')+' '+t('footballSecondSeeDiagnostic')
          +(hadMatches?' · '+t('footballLiveKept'):'');
        paint();return;
      }
      if(!found.length&&hadMatches){lastWarning=t('footballSecondPartialKept');paint();return;}
      current=chosen;viaGlobal=chosenGlobal;loadedKey=key;lastFetched=Date.now();
      lastWarning=!found.length?t('footballSecondEmptyLeague')+' '+t('footballSecondSeeDiagnostic'):'';
      paint();
    }catch(err){
      if(!dead&&thisRequest===requestId)debug.textContent=`${day}: ${String(err.message).slice(0,120)}`;
      if(!dead&&thisRequest===requestId&&!thisController.signal.aborted)
        lastWarning=`${t('footballSecondError')} ${loadedKey===key?t('footballLiveKept'):''} (${String(err.message).slice(0,65)})`;
      else if(!dead&&thisRequest===requestId)lastWarning=t('footballSecondError');
      // Message is rendered in finally after busy is reset.
      // Failed request does not overwrite or delete previously saved data.
    }finally{clearTimeout(timeout);if(thisRequest===requestId){busy=false;if(!dead){refresh.disabled=false;paint();}}}
  }
  const onToggle=()=>{if(toggle.open){paint();if(!loadedKey)void load();}};
  const onSelection=()=>{requestId++;controller?.abort();busy=false;refresh.disabled=false;loadedKey='';lastWarning='';current=[];viaGlobal=false;results.innerHTML='';message.textContent='';checked.textContent='';debug.textContent='';if(toggle.open)void load();};
  const onSearch=()=>{if(loadedKey)paint();};const onRefresh=()=>void load(true);
  const onToday=()=>{select.value=dayUtc();followToday=true;onSelection();};
  const onYesterday=()=>{select.value=dayUtc(1);followToday=false;onSelection();};
  const onSaturday=()=>{select.value=lastSaturdayUtc();followToday=false;onSelection();};
  const onManualDay=()=>{followToday=false;onSelection();};
  const onReturn=()=>{
    if(dead||document.hidden)return;
    const currentToday=dayUtc(0);
    const nextDay=sportScoreDayOnReturn({previousToday:lastKnownToday,currentToday,
      selectedDay:select.value,followToday});
    select.max=currentToday;
    lastKnownToday=currentToday;
    if(nextDay!==select.value){select.value=nextDay;onSelection();}
    else if(toggle.open)paint();
  };
  const today=element.querySelector('#football-second-today');
  const yesterday=element.querySelector('#football-second-yesterday');
  const saturday=element.querySelector('#football-second-saturday');
  // Poll conservatively only while SportScore is visible and its API says a match is live.
  const activeCheck=setInterval(()=>{
    if(dead||document.hidden||!navigator.onLine||!toggle.open||busy||!loadedKey)return;
    paint(); // Refresh displayed age even when no API request is permitted.
    if(loadedKey!==selectionKey()||Date.now()-lastFetched<SECOND_SOURCE_MIN_REFRESH_MS)return;
    if(current.some(m=>m.status==='live'))void load();
  },60_000);
  toggle.addEventListener('toggle',onToggle);select.addEventListener('change',onManualDay);
  document.addEventListener('visibilitychange',onReturn);window.addEventListener('pageshow',onReturn);
  competition.addEventListener('change',onSelection);
  search.addEventListener('input',onSearch);refresh.addEventListener('click',onRefresh);
  today.addEventListener('click',onToday);yesterday.addEventListener('click',onYesterday);
  saturday.addEventListener('click',onSaturday);
  return ()=>{dead=true;clearInterval(activeCheck);controller?.abort();toggle.removeEventListener('toggle',onToggle);
    select.removeEventListener('change',onManualDay);competition.removeEventListener('change',onSelection);
    document.removeEventListener('visibilitychange',onReturn);window.removeEventListener('pageshow',onReturn);
    search.removeEventListener('input',onSearch);refresh.removeEventListener('click',onRefresh);
    today.removeEventListener('click',onToday);yesterday.removeEventListener('click',onYesterday);
    saturday.removeEventListener('click',onSaturday);};
}
