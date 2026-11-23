/** SportScore panel: independent, day-scoped Premier League results.
 * Does not alter the OpenLigaDB league catalogue, cache or favourites.
 */
import {escapeHtml} from './utils.js';
import {dayUtc,lastSaturdayUtc,isValidFootballDay,sportScoreDayUrl,parseSportScoreFixtures,
  sportScoreFiltered,sportScoreForCompetition,sportScoreShownScore,validSportScoreCompetition,
  SECOND_SOURCE_PREMIER_LEAGUE,SECOND_SOURCE_MIN_REFRESH_MS} from './football-second-source-core.js';

export function mountFootballSecondSource({element,t,lang}){
  const select=element.querySelector('#football-second-date');
  const competition=element.querySelector('#football-second-competition');
  const search=element.querySelector('#football-second-search');
  const results=element.querySelector('#football-second-results');
  const message=element.querySelector('#football-second-message');
  const toggle=element.querySelector('#football-second-details');
  const refresh=element.querySelector('#football-second-refresh');
  let day=dayUtc(1),dead=false,busy=false,controller=null,current=[],loadedKey='',lastFetched=0,requestId=0;
  // Choose EPL by default: the user should not need to 'add' it via OpenLigaDB.
  competition.value=SECOND_SOURCE_PREMIER_LEAGUE;
  select.value=day;
  select.max=dayUtc(0);
  const selectionKey=()=>`${select.value}|${competition.value}`;
  function paint(){
    if(!loadedKey){results.innerHTML='';return;}
    const filtered=sportScoreForCompetition(current,competition.value);
    const found=sportScoreFiltered(filtered,search.value);
    results.innerHTML=found.length?found.map(m=>{
      const score=escapeHtml(sportScoreShownScore(m));
      const status=m.status==='finished'?t('footballSecondFinal'):m.status==='live'?t('footballSecondLive'):t('footballSecondUnknown');
      const when=m.time?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(m.time))+' UTC':'';
      return `<article class="football-second-match"><div class="muted football-second-meta">${escapeHtml(m.competition||'')} ${escapeHtml(when)} · ${escapeHtml(status)}</div>
        <div class="football-second-line"><span>${escapeHtml(m.home)} – ${escapeHtml(m.away)}</span><strong>${score}</strong></div></article>`;
    }).join(''):`<p class="muted">${t('footballSecondEmpty')}</p>`;
    message.textContent=`${t('footballSecondShown')}: ${found.length}${filtered.length>80?' · '+t('footballSecondLimit'):''}`;
  }
  async function load(force=false){
    if(dead||busy)return;
    day=select.value;
    if(!isValidFootballDay(day)||day>dayUtc(0)){message.textContent=t('footballSecondBadDay');return;}
    if(!validSportScoreCompetition(competition.value)){message.textContent=t('footballSecondError');return;}
    if(!navigator.onLine){message.textContent=t('footballSecondOffline');return;}
    const key=selectionKey();
    if(loadedKey===key&&Date.now()-lastFetched<SECOND_SOURCE_MIN_REFRESH_MS){
      if(force)message.textContent=t('footballSecondLimited');else paint();return;
    }
    busy=true;refresh.disabled=true;message.textContent=t('weatherLoading');
    controller?.abort();const thisController=new AbortController();controller=thisController;const thisRequest=++requestId;
    const timeout=setTimeout(()=>thisController.abort(),16000);
    try{
      const response=await fetch(sportScoreDayUrl(day,competition.value),{signal:thisController.signal,headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const rows=parseSportScoreFixtures(await response.json());
      if(dead||thisRequest!==requestId||selectionKey()!==key)return;
      current=rows;loadedKey=key;lastFetched=Date.now();paint();
      if(!sportScoreForCompetition(rows,competition.value).length)message.textContent=t('footballSecondEmptyLeague');
    }catch(err){
      if(!dead&&thisRequest===requestId&&!thisController.signal.aborted)message.textContent=`${t('footballSecondError')} (${String(err.message).slice(0,65)})`;
      else if(!dead&&thisRequest===requestId)message.textContent=t('footballSecondError');
      // Failed request does not overwrite or delete previously saved data.
    }finally{clearTimeout(timeout);if(thisRequest===requestId){busy=false;if(!dead)refresh.disabled=false;}}
  }
  const onToggle=()=>{if(toggle.open&&!loadedKey)void load();};
  const onSelection=()=>{requestId++;controller?.abort();busy=false;refresh.disabled=false;loadedKey='';current=[];results.innerHTML='';message.textContent='';if(toggle.open)void load();};
  const onSearch=()=>{if(loadedKey)paint();};const onRefresh=()=>void load(true);
  const onToday=()=>{select.value=dayUtc();onSelection();};
  const onYesterday=()=>{select.value=dayUtc(1);onSelection();};
  const onSaturday=()=>{select.value=lastSaturdayUtc();onSelection();};
  const today=element.querySelector('#football-second-today');
  const yesterday=element.querySelector('#football-second-yesterday');
  const saturday=element.querySelector('#football-second-saturday');
  toggle.addEventListener('toggle',onToggle);select.addEventListener('change',onSelection);
  competition.addEventListener('change',onSelection);
  search.addEventListener('input',onSearch);refresh.addEventListener('click',onRefresh);
  today.addEventListener('click',onToday);yesterday.addEventListener('click',onYesterday);
  saturday.addEventListener('click',onSaturday);
  return ()=>{dead=true;controller?.abort();toggle.removeEventListener('toggle',onToggle);
    select.removeEventListener('change',onSelection);competition.removeEventListener('change',onSelection);
    search.removeEventListener('input',onSearch);refresh.removeEventListener('click',onRefresh);
    today.removeEventListener('click',onToday);yesterday.removeEventListener('click',onYesterday);
    saturday.removeEventListener('click',onSaturday);};
}
