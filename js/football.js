import {getMeta,setMeta} from './db.js';
import {mountFootballSecondSource} from './football-second-source.js';
import {escapeHtml} from './utils.js';
import {FOOTBALL_BASE,MAX_LEAGUES,emptyFootballData,validFootballData,leagueListFromAPI,
  matchURL,parseMatches,matchStatus,visibleMatches,hasPossibleMatch} from './football-core.js';
import {footballRefreshDelay} from './football-refresh-core.js';
import {footballResultHealth,hasConfirmedResult,needsResultCheck,mergeFootballMatches,singleFootballMatchURL,matchSearchURL,SINGLE_MATCH_COOLDOWN_MS} from './football-recovery-core.js';

// Match-aware TTLs keep quiet leagues on a light schedule.
const LIVE_AFTER=90*1000;
const CATALOG_AFTER=24*60*60*1000;
const locale=lang=>lang==='en'?'en-GB':'bg-BG';
const when=(stamp,lang)=>new Intl.DateTimeFormat(locale(lang),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(stamp));
const matchWhen=(stamp,lang)=>new Intl.DateTimeFormat(locale(lang),{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(stamp));
const ageMs=iso=>Math.max(0,Date.now()-Date.parse(iso));
const statusText=(status,t)=>t(`footballStatus${status[0].toUpperCase()}${status.slice(1)}`);
const esc=escapeHtml;

export async function mountFootball({element,t,lang,notify,confirmAction}){
  let stored=await getMeta('footballData');
  if(stored!==undefined&&!validFootballData(stored)){
    element.innerHTML=`<section class="tool-head"><h1>${t('football')}</h1></section><section class="surface"><p class="warning-text">${t('footballCorrupt')}</p></section>`;
    return ()=>{}; // Never overwrite corrupt existing data.
  }
  let data=stored===undefined?emptyFootballData():stored;
  let tab='all',catalog=null,catalogAt='',isBusy=false,isLoadingLeagues=false,dead=false;
  let currentController=null,catalogController=null,lastPoll=0,pollStamp='',nextRetry=0,needReload=false,failureCount=0;
  let pendingSave=Promise.resolve();
  let singleCheckId=0;const singleChecked=new Map();
  element.innerHTML=`<section class="tool-head"><span class="eyebrow">09 / MYHUB</span><h1>${t('football')}</h1><p>${t('footballIntro')}</p></section>
    <section class="surface football-toolbar"><div class="row-between gap-wrap"><h2>${t('footballMyLeagues')}</h2><button type="button" class="text-link" id="football-manage">＋ ${t('footballAddLeague')}</button></div>
      <label for="football-league" class="sr-only">${t('footballSelectLeague')}</label><select id="football-league" class="input-select football-select"></select>
      <div id="football-add-panel" hidden><p class="muted">${t('footballSearchLeagueHint')}</p>
        <label class="sr-only" for="football-search">${t('footballSearchLeague')}</label><input id="football-search" class="text-field" type="search" maxlength="60" placeholder="${t('footballSearchLeague')}">
        <div id="football-league-results" class="football-league-results"></div></div>
      <div class="row-between gap-wrap football-refresh"><span id="football-updated" class="muted"></span><div class="football-actions"><button type="button" id="football-remove-league" class="text-link">${t('footballRemoveLeague')}</button><button type="button" id="football-refresh" class="secondary-btn">↻ ${t('weatherRefresh')}</button></div></div>
      <p id="football-message" class="football-message" role="status" aria-live="polite"></p>
      <p id="football-health" class="football-health muted" role="status"></p></section>
    <section class="surface football-results"><div class="football-tabs" role="group" aria-label="${t('footballFilters')}">
      <button type="button" data-football-tab="all">${t('footballAll')}</button>
      <button type="button" data-football-tab="upcoming">${t('footballUpcoming')}</button>
      <button type="button" data-football-tab="finished">${t('footballFinished')}</button>
      <button type="button" data-football-tab="favorites">★ ${t('footballFavorites')}</button></div>
      <div id="football-matches" aria-live="polite"></div></section>
    <details class="surface football-second-panel" id="football-second-details"><summary>${t('footballSecondTitle')}</summary>
      <p class="muted">${t('footballSecondHint')}</p>
      <label class="football-second-league-label" for="football-second-competition">${t('footballSecondCompetition')}
        <select class="input-select" id="football-second-competition">
          <option value="premier-league">English Premier League</option>
          <option value="">${t('footballSecondAllLeagues')}</option>
        </select>
      </label>
      <p class="muted">${t('footballSecondIndependent')}</p>
      <div class="football-second-controls"><label>${t('footballSecondDate')} (UTC)<input class="text-field" id="football-second-date" type="date"></label>
        <button type="button" class="secondary-btn" id="football-second-today">${t('calendarToday')}</button>
        <button type="button" class="secondary-btn" id="football-second-yesterday">${t('footballSecondYesterday')}</button>
        <button type="button" class="secondary-btn" id="football-second-saturday">${t('footballSecondSaturday')}</button>
        <button type="button" class="secondary-btn" id="football-second-refresh">↻ ${t('weatherRefresh')}</button></div>
      <label class="sr-only" for="football-second-search">${t('footballSecondFilter')}</label>
      <input class="text-field football-second-search" id="football-second-search" type="search" maxlength="80" placeholder="${t('footballSecondFilter')}">
      <p id="football-second-message" class="muted" role="status" aria-live="polite"></p>
      <div id="football-second-results" aria-live="polite"></div>
      <p class="football-source"><a href="https://sportscore.com/football/competition/england/english-premier-league/jednm9whz0ryox8/" rel="noopener noreferrer" target="_blank">${t('footballSecondOpenEpl')}</a></p>
      <p class="football-source"><a href="https://sportscore.com/" rel="dofollow" title="Sports data by SportScore" target="_blank">Powered by SportScore</a> · ${t('footballSecondDisclaimer')}</p>
    </details>
    <p class="football-source">${t('footballSource')}: <a href="https://www.openligadb.de/" target="_blank" rel="noopener noreferrer">OpenLigaDB</a> (<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL 1.0</a>) · ${t('footballCaution')}</p>`;
  const releaseSecondSource=mountFootballSecondSource({element,t,lang});
  const one=sel=>element.querySelector(sel);
  const select=one('#football-league'),results=one('#football-matches');
  const league=()=>data.leagues.find(l=>l.key===data.selected);
  const activeSnapshot=()=>data.cache[data.selected];
  const displayMessage=text=>{one('#football-message').textContent=text;};
  const save=async(next)=>{
    if(!validFootballData(next))throw Error('Invalid Football data');
    const old=data;data=next;render();
    try{const snapshot=structuredClone(next);pendingSave=pendingSave.catch(()=>{}).then(()=>setMeta('footballData',snapshot));await pendingSave;}
    catch(err){data=old;render();notify(t('footballSaveFailed'));throw err;}
  };
  const safeAction=fn=>async(...args)=>{try{await fn(...args);}catch(err){console.warn(err);displayMessage(t('footballError'));}};
  function paintLeagueSelect(){
    select.innerHTML=data.leagues.map(l=>`<option value="${esc(l.key)}" ${l.key===data.selected?'selected':''}>${esc(l.name)} (${l.season})</option>`).join('');
    one('#football-remove-league').disabled=data.leagues.length===1;
    one('#football-manage').disabled=data.leagues.length>=MAX_LEAGUES;
  }
  function matchesForTab(){
    if(tab==='favorites'){
      const all=[];for(const [key,cache] of Object.entries(data.cache)){
        const matchLeague=data.leagues.find(l=>l.key===key);
        if(matchLeague){for(const m of cache.matches)all.push({...m,leagueName:matchLeague.name,uniqueId:key+'/'+m.id});}
      }
      const ids=new Set(data.favoriteTeams);
      return all.filter(m=>ids.has(m.homeId)||ids.has(m.awayId))
        .sort((a,b)=>Math.abs(Date.parse(a.time)-Date.now())-Math.abs(Date.parse(b.time)-Date.now())).slice(0,42);
    }
    return visibleMatches(activeSnapshot()?.matches||[],tab,data.favoriteTeams);
  }
  function paintMatches(){
    const snap=activeSnapshot();
    const list=matchesForTab();
    one('#football-updated').textContent=snap?`${t('footballChecked')}: ${when(snap.fetchedAt,lang)}${!navigator.onLine?' · '+t('footballCached'):''}`:t('footballNeverChecked');
    one('#football-refresh').disabled=isBusy||!navigator.onLine;
    one('#football-refresh').textContent=isBusy?t('weatherLoading'):`↻ ${t('weatherRefresh')}`;
    const health=footballResultHealth(snap?.matches||[]);
    one('#football-health').textContent=health.unconfirmed?`${t('footballMissingSummary')} ${health.unconfirmed} · ${t('footballMissingExplanation')}`:'';
    element.querySelectorAll('[data-football-tab]').forEach(btn=>{
      btn.classList.toggle('selected',tab===btn.dataset.footballTab);
      btn.setAttribute('aria-pressed',String(tab===btn.dataset.footballTab));
    });
    if(!snap&&tab!=='favorites'){
      results.innerHTML=`<p class="muted football-empty">${navigator.onLine?t('footballNotLoaded'):t('footballOffline')}</p>`;return;
    }
    if(!list.length){results.innerHTML=`<p class="muted football-empty">${tab==='favorites'?t('footballFavoriteEmpty'):t('footballNoMatches')}</p>`;return;}
    results.innerHTML=list.map(m=>{
      const status=m.finished&&!hasConfirmedResult(m)?'unconfirmed':matchStatus(m),score=m.homeScore===null?'– : –':`${m.homeScore} : ${m.awayScore}`;
      const homeFav=data.favoriteTeams.includes(m.homeId),awayFav=data.favoriteTeams.includes(m.awayId);
      const missing=needsResultCheck(m);
      const checkLink=missing?matchSearchURL(m):'';
      const canCheck=missing&&(!m.uniqueId||m.uniqueId.startsWith(`${data.selected}/`));
      return `<article class="football-match"><div class="football-match-info"><span>${esc(matchWhen(m.time,lang))}</span><span class="football-status ${status}">${esc(statusText(status,t))}</span></div>
        ${m.leagueName?`<div class="football-league-name">${esc(m.leagueName)}</div>`:''}
        <div class="football-match-main"><div class="football-team"><button type="button" class="football-star ${homeFav?'is-fav':''}" data-football-team="${m.homeId}" aria-pressed="${homeFav}" aria-label="${homeFav?t('footballUnstar'):t('footballStar')} ${esc(m.home)}">${homeFav?'★':'☆'}</button><span>${esc(m.home)}</span></div>
        <strong class="football-score" aria-label="${esc(score)}">${score}</strong>
        <div class="football-team away"><span>${esc(m.away)}</span><button type="button" class="football-star ${awayFav?'is-fav':''}" data-football-team="${m.awayId}" aria-pressed="${awayFav}" aria-label="${awayFav?t('footballUnstar'):t('footballStar')} ${esc(m.away)}">${awayFav?'★':'☆'}</button></div></div>
        ${missing?`<div class="football-result-help"><span>${t('footballNoProviderResult')}</span>${canCheck?`<button type="button" class="text-link" data-football-check="${m.id}" ${isBusy||singleCheckId?'disabled':''}>${singleCheckId===m.id?t('weatherLoading'):t('footballCheckMatch')}</button>`:''}<a href="${esc(checkLink)}" target="_blank" rel="noopener noreferrer">${t('footballSearchExternal')}</a></div>`:''}</article>`;
    }).join('');
  }
  function render(){if(dead)return;paintLeagueSelect();paintMatches();}
  async function addLeague(key){
    if(data.leagues.length>=MAX_LEAGUES){notify(t('footballLimit'));return;}
    const item=catalog?.find(l=>l.key===key);
    if(!item||data.leagues.some(l=>l.key===key))return;
    await save({...data,leagues:[...data.leagues,item],selected:item.key});
    one('#football-add-panel').hidden=true;tab='all';render();
    await loadMatches(false);
  }
  function paintCatalog(){
    const q=one('#football-search').value.trim().toLocaleLowerCase();
    const all=(catalog||[]).filter(l=>!data.leagues.some(x=>x.key===l.key)&&(`${l.name} ${l.shortcut} ${l.season}`).toLocaleLowerCase().includes(q)).slice(0,35);
    one('#football-league-results').innerHTML=all.length?all.map(l=>`<button class="football-league-option" type="button" data-football-add="${esc(l.key)}"><span>${esc(l.name)} <small>${l.season}</small></span><strong>＋</strong></button>`).join(''):`<p class="muted">${t('footballNoLeagues')}</p>`;
  }
  async function fetchJSON(url,signal){
    const response=await fetch(url,{signal,cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    return response.json();
  }
  async function loadCatalog(){
    if(isLoadingLeagues)return;isLoadingLeagues=true;
    displayMessage(t('weatherLoading'));
    try{
      const saved=await getMeta('footballCatalog');
      if(saved&&Array.isArray(saved.leagues)&&typeof saved.at==='string'&&ageMs(saved.at)<CATALOG_AFTER){
        const safe=saved.leagues.filter(l=>l&&typeof l.name==='string'&&typeof l.key==='string');
        if(safe.length){catalog=leagueListFromAPI(safe.map(l=>({leagueShortcut:l.shortcut,leagueSeason:l.season,leagueName:l.name,sport:{sportId:1}})));catalogAt=saved.at;}
      }
      if(!catalog){
        if(!navigator.onLine)throw Error('Offline');
        catalogController?.abort();const controller=new AbortController();catalogController=controller;
        const timeout=setTimeout(()=>controller.abort(),18000);
        try{catalog=leagueListFromAPI(await fetchJSON(`${FOOTBALL_BASE}/getavailableleagues`,controller.signal));}
        finally{clearTimeout(timeout);}
        catalogAt=new Date().toISOString();
        if(!dead)await setMeta('footballCatalog',{at:catalogAt,leagues:catalog});
      }
      if(!dead){paintCatalog();displayMessage('');}
    }catch(err){if(!dead)displayMessage(`${t('footballLeagueError')} ${String(err.message).slice(0,80)}`);}
    finally{isLoadingLeagues=false;}
  }
  async function loadMatches(force=false){
    if(dead||!navigator.onLine)return;
    if(isBusy){needReload=true;currentController?.abort();return;}
    const current=league();if(!current)return;
    const snapshot=activeSnapshot();
    const minDelay=footballRefreshDelay(snapshot?.matches||[],force);
    if(snapshot&&ageMs(snapshot.fetchedAt)<minDelay){
      if(force)displayMessage(t('footballRefreshLimited'));
      render();return;
    }
    if(Date.now()<nextRetry){if(force)displayMessage(t('footballRefreshLimited'));return;}
    isBusy=true;render();displayMessage(t('weatherLoading'));
    const controller=new AbortController();currentController?.abort();currentController=controller;
    const timeout=setTimeout(()=>controller.abort(),18000);
    try{
      const json=await fetchJSON(matchURL(current),controller.signal);
      const matches=parseMatches(json);
      if(!dead){
        // A temporarily empty/partial provider response must not erase a previously fuller cache.
        if(current.key!==data.selected)return;
        const previous=snapshot?.matches||[];
        const incomplete=previous.length>0 && matches.length<previous.length;
        const safeMatches=mergeFootballMatches(previous,matches);
        if(!matches.length && previous.length){displayMessage(t('footballPartial'));return;}
        await save({...data,cache:{...data.cache,[current.key]:{fetchedAt:new Date().toISOString(),matches:safeMatches}}});
        failureCount=0;nextRetry=0;
        displayMessage(incomplete?t('footballPartial'):(matches.length?'':t('footballNoMatches')));
      }
    }catch(err){
      if(!dead&&!controller.signal.aborted){
        displayMessage(t('footballFetchError')+` (${String(err.message).slice(0,60)})`);
        if(/HTTP (429|5\d\d)/.test(String(err.message)))failureCount=Math.min(failureCount+1,5);
        nextRetry=Date.now()+Math.min(60,5*2**Math.max(0,failureCount-1))*60*1000;
      }
    }finally{clearTimeout(timeout);isBusy=false;render();if(needReload&&!dead){needReload=false;void loadMatches();}}
  }
  async function pollLive(){
    if(dead||isBusy||document.hidden||!navigator.onLine||Date.now()<nextRetry)return;
    const current=league(),snap=activeSnapshot();
    if(!snap||!hasPossibleMatch(snap.matches))return;
    if(Date.now()-lastPoll<LIVE_AFTER)return;
    lastPoll=Date.now();
    const match=snap.matches.find(m=>matchStatus(m)==='possible'&&m.group>0);
    if(!match)return;
    const controller=new AbortController();currentController=controller;
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const changed=await fetchJSON(`${FOOTBALL_BASE}/getlastchangedate/${encodeURIComponent(current.shortcut)}/${current.season}/${match.group}`,controller.signal);
      const stamp=typeof changed==='string'?changed:JSON.stringify(changed);
      if(dead||current.key!==data.selected)return;
      if(pollStamp&&stamp!==pollStamp&&ageMs(snap.fetchedAt)>=LIVE_AFTER){
        // The change endpoint is inexpensive; only refetch the season if the source changed.
        await loadMatches(true);
      }
      pollStamp=stamp;
    }catch(err){if(!controller.signal.aborted)nextRetry=Date.now()+10*60*1000;}
    finally{clearTimeout(timeout);}
  }
  async function checkSingleMatch(id){
    if(dead||!navigator.onLine||isBusy||singleCheckId)return;
    const current=league(),snap=activeSnapshot();
    const old=snap?.matches.find(m=>m.id===id);
    if(!old||!needsResultCheck(old))return;
    if(Date.now()-(singleChecked.get(id)||0)<SINGLE_MATCH_COOLDOWN_MS){displayMessage(t('footballSingleLimited'));return;}
    singleChecked.set(id,Date.now());singleCheckId=id;render();displayMessage(t('weatherLoading'));
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetchJSON(singleFootballMatchURL(id),controller.signal);
      const fresh=parseMatches([response])[0];
      if(dead||current.key!==data.selected)return;
      if(!fresh||fresh.id!==id){displayMessage(t('footballSingleUnavailable'));return;}
      const latest=activeSnapshot();
      const updated=mergeFootballMatches(latest?.matches||[],[fresh]);
      await save({...data,cache:{...data.cache,[current.key]:{fetchedAt:new Date().toISOString(),matches:updated}}});
      displayMessage(hasConfirmedResult(updated.find(m=>m.id===id))?t('footballSingleUpdated'):t('footballSingleStillMissing'));
    }catch(err){
      if(!dead)displayMessage(`${t('footballFetchError')} (${String(err.message).slice(0,50)})`);
    }finally{clearTimeout(timeout);singleCheckId=0;render();}
  }
  select.addEventListener('change',safeAction(async()=>{
    currentController?.abort();pollStamp='';lastPoll=0;tab='all';
    await save({...data,selected:select.value});displayMessage('');await loadMatches();
  }));
  one('#football-refresh').addEventListener('click',safeAction(()=>loadMatches(true)));
  one('#football-remove-league').addEventListener('click',safeAction(async()=>{
    if(data.leagues.length<=1||!confirmAction(t('footballRemoveConfirm')))return;
    const selected=data.selected,leagues=data.leagues.filter(l=>l.key!==selected),cache={...data.cache};delete cache[selected];
    currentController?.abort();pollStamp='';lastPoll=0;
    await save({...data,leagues,cache,selected:leagues[0].key});tab='all';
    await loadMatches();
  }));
  one('#football-manage').addEventListener('click',safeAction(async()=>{
    const panel=one('#football-add-panel');panel.hidden=!panel.hidden;
    if(!panel.hidden){await loadCatalog();one('#football-search').focus();}
  }));
  one('#football-search').addEventListener('input',paintCatalog);
  one('#football-league-results').addEventListener('click',event=>{
    const btn=event.target.closest('[data-football-add]');if(btn)void safeAction(()=>addLeague(btn.dataset.footballAdd))();
  });
  element.querySelectorAll('[data-football-tab]').forEach(btn=>btn.addEventListener('click',()=>{tab=btn.dataset.footballTab;render();}));
  results.addEventListener('click',event=>{
    const check=event.target.closest('[data-football-check]');
    if(check){void safeAction(()=>checkSingleMatch(Number(check.dataset.footballCheck)))();return;}
    const btn=event.target.closest('[data-football-team]');if(!btn)return;
    void safeAction(async()=>{
      const id=Number(btn.dataset.footballTeam),fav=data.favoriteTeams.filter(x=>x!==id);
      if(!data.favoriteTeams.includes(id)){
        if(fav.length>=100){notify(t('footballTeamLimit'));return;}
        fav.push(id);
      }
      await save({...data,favoriteTeams:fav});
    })();
  });
  const tick=()=>{if(dead||document.hidden||!navigator.onLine)return;
    const snap=activeSnapshot();
    // Always check the TTL, including matches that started recently or ended late.
    // The inexpensive change-date poll supplements, but never blocks, refresh.
    if(snap&&hasPossibleMatch(snap.matches))void pollLive();
    void loadMatches();
  };
  const interval=setInterval(tick,LIVE_AFTER);
  const onFocus=()=>tick();document.addEventListener('visibilitychange',onFocus);
  const onOnline=()=>{render();tick();},onOffline=()=>render();
  window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);
  render();void loadMatches();
  return ()=>{dead=true;releaseSecondSource();clearInterval(interval);document.removeEventListener('visibilitychange',onFocus);
    window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);currentController?.abort();catalogController?.abort();};
}
