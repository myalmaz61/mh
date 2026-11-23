/** Optional second-source panel: does not write to IndexedDB or personal backups. */
import {escapeHtml} from './utils.js';
import {dayUtc,isValidFootballDay,sportScoreDayUrl,parseSportScoreFixtures,
  sportScoreFiltered,sportScoreShownScore,SECOND_SOURCE_MIN_REFRESH_MS} from './football-second-source-core.js';

export function mountFootballSecondSource({element,t,lang}){
  const select=element.querySelector('#football-second-date');
  const search=element.querySelector('#football-second-search');
  const results=element.querySelector('#football-second-results');
  const message=element.querySelector('#football-second-message');
  const toggle=element.querySelector('#football-second-details');
  const refresh=element.querySelector('#football-second-refresh');
  let day=dayUtc(1),dead=false,busy=false,controller=null,current=[],loadedDay='',lastFetched=0,requestId=0;
  select.value=day;
  select.max=dayUtc(0);
  function paint(){
    if(!loadedDay){results.innerHTML='';return;}
    const found=sportScoreFiltered(current,search.value);
    results.innerHTML=found.length?found.map(m=>{
      const score=escapeHtml(sportScoreShownScore(m));
      const status=m.status==='finished'?t('footballSecondFinal'):m.status==='live'?t('footballSecondLive'):t('footballSecondUnknown');
      const when=m.time?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(m.time))+' UTC':'';
      return `<article class="football-second-match"><div class="muted football-second-meta">${escapeHtml(m.competition||'')} ${escapeHtml(when)} · ${escapeHtml(status)}</div>
        <div class="football-second-line"><span>${escapeHtml(m.home)} – ${escapeHtml(m.away)}</span><strong>${score}</strong></div></article>`;
    }).join(''):`<p class="muted">${t('footballSecondEmpty')}</p>`;
    const count=sportScoreFiltered(current,search.value).length;
    message.textContent=`${t('footballSecondShown')}: ${count}${current.length>80?' · '+t('footballSecondLimit'):''}`;
  }
  async function load(force=false){
    if(dead||busy)return;
    day=select.value;
    if(!isValidFootballDay(day)||day>dayUtc(0)){message.textContent=t('footballSecondBadDay');return;}
    if(!navigator.onLine){message.textContent=t('footballSecondOffline');return;}
    if(!force&&loadedDay===day&&Date.now()-lastFetched<SECOND_SOURCE_MIN_REFRESH_MS){paint();return;}
    if(force&&loadedDay===day&&Date.now()-lastFetched<SECOND_SOURCE_MIN_REFRESH_MS){message.textContent=t('footballSecondLimited');return;}
    busy=true;refresh.disabled=true;message.textContent=t('weatherLoading');
    controller?.abort();const thisController=new AbortController();controller=thisController;const thisRequest=++requestId;
    const timeout=setTimeout(()=>thisController.abort(),16000);
    try{
      const response=await fetch(sportScoreDayUrl(day),{signal:thisController.signal,headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const rows=parseSportScoreFixtures(await response.json());
      if(dead||thisRequest!==requestId||select.value!==day)return;
      current=rows;loadedDay=day;lastFetched=Date.now();paint();
      if(!rows.length)message.textContent=t('footballSecondEmpty');
    }catch(err){
      if(!dead&&thisRequest===requestId&&!thisController.signal.aborted)message.textContent=`${t('footballSecondError')} (${String(err.message).slice(0,65)})`;
      else if(!dead&&thisRequest===requestId)message.textContent=t('footballSecondError');
      // A failed request must not erase previously retrieved results.
    }finally{clearTimeout(timeout);if(thisRequest===requestId){busy=false;if(!dead)refresh.disabled=false;}}
  }
  const onToggle=()=>{if(toggle.open&&!loadedDay)void load();};
  const onDate=()=>{requestId++;controller?.abort();busy=false;refresh.disabled=false;loadedDay='';current=[];results.innerHTML='';if(toggle.open)void load();};
  const onSearch=()=>{if(loadedDay)paint();};const onRefresh=()=>void load(true);
  const onToday=()=>{select.value=dayUtc();onDate();};
  const onYesterday=()=>{select.value=dayUtc(1);onDate();};
  const today=element.querySelector('#football-second-today');
  const yesterday=element.querySelector('#football-second-yesterday');
  toggle.addEventListener('toggle',onToggle);select.addEventListener('change',onDate);
  search.addEventListener('input',onSearch);refresh.addEventListener('click',onRefresh);
  today.addEventListener('click',onToday);yesterday.addEventListener('click',onYesterday);
  return ()=>{dead=true;controller?.abort();toggle.removeEventListener('toggle',onToggle);select.removeEventListener('change',onDate);search.removeEventListener('input',onSearch);refresh.removeEventListener('click',onRefresh);today.removeEventListener('click',onToday);yesterday.removeEventListener('click',onYesterday);};
}
