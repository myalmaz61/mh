import {getMeta,setMeta} from './db.js';
import {escapeHtml} from './utils.js';
import {FOOTBALL_BASE,MAX_LEAGUES,emptyFootballData,validFootballData,leagueListFromAPI,
  matchURL,parseMatches,matchStatus,visibleMatches,hasPossibleMatch} from './football-core.js';

const AUTO_AFTER=2*60*60*1000; // only a few updates per day, when screen is visible
const MANUAL_AFTER=30*60*1000;
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
  element.innerHTML=`<section class="tool-head"><span class="eyebrow">09 / MYHUB</span><h1>${t('football')}</h1><p>${t('footballIntro')}</p></section>
    <section class="surface football-toolbar"><div class="row-between gap-wrap"><h2>${t('footballMyLeagues')}</h2><button type="button" class="text-link" id="football-manage">＋ ${t('footballAddLeague')}</button></div>
      <label for="football-league" class="sr-only">${t('footballSelectLeague')}</label><select id="football-league" class="input-select football-select"></select>
      <div id="football-add-panel" hidden><p class="muted">${t('footballSearchLeagueHint')}</p>
        <label class="sr-only" for="football-search">${t('footballSearchLeague')}</label><input id="football-search" class="text-field" type="search" maxlength="60" placeholder="${t('footballSearchLeague')}">
        <div id="football-league-results" class="football-league-results"></div></div>
      <div class="row-between gap-wrap football-refresh"><span id="football-updated" class="muted"></span><div class="football-actions"><button type="button" id="football-remove-league" class="text-link">${t('footballRemoveLeague')}</button><button type="button" id="football-refresh" class="secondary-btn">↻ ${t('weatherRefresh')}</button></div></div>
      <p id="football-message" class="football-message" role="status" aria-live="polite"></p></section>
    <section class="surface football-results"><div class="football-tabs" role="group" aria-label="${t('footballFilters')}">
      <button type="button" data-football-tab="all">${t('footballAll')}</button>
      <button type="button" data-football-tab="upcoming">${t('footballUpcoming')}</button>
      <button type="button" data-football-tab="finished">${t('footballFinished')}</button>
      <button type="button" data-football-tab="favorites">★ ${t('footballFavorites')}</button></div>
      <div id="football-matches" aria-live="polite"></div></section>
    <p class="football-source">${t('footballSource')}: <a href="https://www.openligadb.de/" target="_blank" rel="noopener noreferrer">OpenLigaDB</a> (<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL 1.0</a>) · ${t('footballCaution')}</p>`;
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
    element.querySelectorAll('[data-football-tab]').forEach(btn=>{
      btn.classList.toggle('selected',tab===btn.dataset.footballTab);
      btn.setAttribute('aria-pressed',String(tab===btn.dataset.footballTab));
    });
    if(!snap&&tab!=='favorites'){
      results.innerHTML=`<p class="muted football-empty">${navigator.onLine?t('footballNotLoaded'):t('footballOffline')}</p>`;return;
    }
    if(!list.length){results.innerHTML=`<p class="muted football-empty">${tab==='favorites'?t('footballFavoriteEmpty'):t('footballNoMatches')}</p>`;return;}
    results.innerHTML=list.map(m=>{
      const status=matchStatus(m),score=m.homeScore===null?'– : –':`${m.homeScore} : ${m.awayScore}`;
      const homeFav=data.favoriteTeams.includes(m.homeId),awayFav=data.favoriteTeams.includes(m.awayId);
      return `<article class="football-match"><div class="football-match-info"><span>${esc(matchWhen(m.time,lang))}</span><span class="football-status ${status}">${esc(statusText(status,t))}</span></div>
        ${m.leagueName?`<div class="football-league-name">${esc(m.leagueName)}</div>`:''}
        <div class="football-match-main"><div class="football-team"><button type="button" class="football-star ${homeFav?'is-fav':''}" data-football-team="${m.homeId}" aria-pressed="${homeFav}" aria-label="${homeFav?t('footballUnstar'):t('footballStar')} ${esc(m.home)}">${homeFav?'★':'☆'}</button><span>${esc(m.home)}</span></div>
        <strong class="football-score" aria-label="${esc(score)}">${score}</strong>
        <div class="football-team away"><span>${esc(m.away)}</span><button type="button" class="football-star ${awayFav?'is-fav':''}" data-football-team="${m.awayId}" aria-pressed="${awayFav}" aria-label="${awayFav?t('footballUnstar'):t('footballStar')} ${esc(m.away)}">${awayFav?'★':'☆'}</button></div></div></article>`;
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
    const minDelay=hasPossibleMatch(snapshot?.matches||[])?LIVE_AFTER:MANUAL_AFTER;
    if(snapshot&&ageMs(snapshot.fetchedAt)<(force?minDelay:AUTO_AFTER)){
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
        if(snapshot?.matches?.length && matches.length<snapshot.matches.length){
          displayMessage(t('footballPartial'));return;
        }
        await save({...data,cache:{...data.cache,[current.key]:{fetchedAt:new Date().toISOString(),matches}}});
        failureCount=0;nextRetry=0;
        displayMessage(matches.length?'':t('footballNoMatches'));
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
    if(snap&&hasPossibleMatch(snap.matches))void pollLive();
    else void loadMatches();
  };
  const interval=setInterval(tick,LIVE_AFTER);
  const onFocus=()=>tick();document.addEventListener('visibilitychange',onFocus);
  const onOnline=()=>{render();tick();},onOffline=()=>render();
  window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);
  render();void loadMatches();
  return ()=>{dead=true;clearInterval(interval);document.removeEventListener('visibilitychange',onFocus);
    window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);currentController?.abort();catalogController?.abort();};
}
