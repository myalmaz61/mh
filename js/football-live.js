/** MyHub v5.2.0 — opt-in independent SportScore live/recent feed.
 * No local football state writes; hides older scores rather than mislabeling them live.
 */
import {escapeHtml} from './utils.js';
import {parseSportScoreFixtures,sportScoreShownScore,sportScoreSourceView} from './football-second-source-core.js';
import {FOOTBALL_LIVE_URL,FOOTBALL_LIVE_MIN_REFRESH_MS,FOOTBALL_LIVE_MAX_ITEMS,
  footballLiveSummary,footballLiveVisible,footballLiveFreshness} from './football-live-core.js';

export function mountFootballLive({element,t,lang}){
  const panel=element.querySelector('#football-live-details');
  const refresh=element.querySelector('#football-live-refresh');
  const onlyLive=element.querySelector('#football-live-only');
  const search=element.querySelector('#football-live-search');
  const list=element.querySelector('#football-live-results');
  const message=element.querySelector('#football-live-message');
  const updated=element.querySelector('#football-live-updated');
  const count=element.querySelector('#football-live-count');
  let rows=[],loaded=false,checkedAt=0,lastAttempt=0,retryAfter=0,busy=false,dead=false,controller=null;
  let filterLive=false;
  const formatTime=timestamp=>new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',
    {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(timestamp));
  const timeOf=timestamp=>new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',
    {hour:'2-digit',minute:'2-digit'}).format(new Date(timestamp));

  function paint(){
    if(dead)return;
    const freshness=footballLiveFreshness(checkedAt);
    const totals=footballLiveSummary(rows);
    updated.textContent=loaded?`${t('footballLiveChecked')}: ${formatTime(checkedAt)} · ${t('footballMinutesAgo').replace('{n}',String(freshness.minutes))}${freshness.stale?' · '+t('footballLiveOld'):''}`:'';
    count.textContent=loaded?`${t('footballLiveReported')}: ${totals.live} · ${t('footballLiveTotal')}: ${totals.total}`:'';
    onlyLive.setAttribute('aria-pressed',String(filterLive));
    onlyLive.classList.toggle('selected',filterLive);
    refresh.disabled=busy||!navigator.onLine;
    if(!loaded){list.innerHTML='';return;}
    const shown=footballLiveVisible(rows,{query:search.value,onlyLive:filterLive});
    if(!shown.length){list.innerHTML=`<p class="muted football-empty">${filterLive?t('footballLiveEmptyLive'):t('footballLiveEmpty')}</p>`;return;}
    list.innerHTML=shown.map(m=>{
      const status=t(sportScoreSourceView(m,checkedAt).labelKey);
      const when=m.time?timeOf(m.time):'';
      return `<article class="football-second-match"><div class="muted football-second-meta">${escapeHtml(m.competition||'')} ${when?escapeHtml(when):''} · ${escapeHtml(status)}</div>
        <div class="football-second-line"><span>${escapeHtml(m.home)} – ${escapeHtml(m.away)}</span><strong>${escapeHtml(sportScoreShownScore(m))}</strong></div></article>`;
    }).join('');
  }
  async function load(){
    if(dead||!panel.open||busy)return;
    if(!navigator.onLine){message.textContent=t('footballSecondOffline');paint();return;}
    const now=Date.now();
    if(now<retryAfter){message.textContent=t('footballLiveRateLimit');paint();return;}
    if(now-lastAttempt<FOOTBALL_LIVE_MIN_REFRESH_MS){message.textContent=t('footballLiveWait');paint();return;}
    lastAttempt=now;busy=true;refresh.disabled=true;
    message.textContent=t('weatherLoading');
    const current=new AbortController();controller=current;
    const timeout=setTimeout(()=>current.abort(),16000);
    try{
      const response=await fetch(FOOTBALL_LIVE_URL,{signal:current.signal,headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const payload=await response.json();
      // Validate both envelope and row count; never turn malformed data into 'no games'.
      if(!payload||!Array.isArray(payload.matches)||payload.matches.length>FOOTBALL_LIVE_MAX_ITEMS)
        throw Error('Unexpected SportScore live format');
      const fresh=parseSportScoreFixtures(payload);
      if(payload.matches.length&&!fresh.length)throw Error('No valid SportScore matches');
      if(dead||controller!==current)return;
      rows=fresh;loaded=true;checkedAt=Date.now();retryAfter=0;
      message.textContent=t('footballLiveLimitedCoverage');
    }catch(err){
      if(/HTTP 429/.test(String(err.message)))retryAfter=Date.now()+10*60_000;
      if(!dead&&controller===current){
        message.textContent=`${t('footballLiveFailed')} ${loaded?t('footballLiveKept'):''} (${String(err.message).slice(0,55)})`;
      }
    }finally{
      clearTimeout(timeout);
      if(controller===current){controller=null;busy=false;if(!dead)paint();}
    }
  }
  const onToggle=()=>{if(panel.open){if(!loaded||Date.now()-lastAttempt>=FOOTBALL_LIVE_MIN_REFRESH_MS)void load();else paint();}};
  const onRefresh=()=>void load();
  const onFilter=()=>{filterLive=!filterLive;paint();};
  const onSearch=()=>paint();
  const onReturn=()=>{if(dead||document.hidden||!panel.open)return;paint();
    if(loaded&&rows.some(m=>m.status==='live')&&Date.now()-lastAttempt>=FOOTBALL_LIVE_MIN_REFRESH_MS)void load();};
  // Conservative periodic checking only when the panel is open and the provider
  // most recently reported a live match; never background-poll an empty list.
  const interval=setInterval(onReturn,60_000);
  panel.addEventListener('toggle',onToggle);
  refresh.addEventListener('click',onRefresh);
  onlyLive.addEventListener('click',onFilter);
  search.addEventListener('input',onSearch);
  document.addEventListener('visibilitychange',onReturn);
  window.addEventListener('online',onReturn);
  paint();
  return ()=>{dead=true;clearInterval(interval);controller?.abort();
    panel.removeEventListener('toggle',onToggle);refresh.removeEventListener('click',onRefresh);
    onlyLive.removeEventListener('click',onFilter);search.removeEventListener('input',onSearch);
    document.removeEventListener('visibilitychange',onReturn);window.removeEventListener('online',onReturn);};
}
