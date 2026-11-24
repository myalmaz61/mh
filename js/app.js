import { VERSION, TOOLS, DEFAULT_SETTINGS } from './config.js';
import { translate } from './i18n.js';
import { escapeHtml, humanDate } from './utils.js';
import { openDatabase, getMeta, setMeta, getNotes, normaliseSettings, createBackup, readBackupSnapshot, replaceFromBackup, validateBackup } from './db.js';
import { mountCalculator } from './calculator.js';
import { mountWorldClock } from './world-clock.js';
import { mountNotes } from './notes.js';
import { mountWeather } from './weather.js';
import { mountTimer } from './timer.js';
import { mountCalendar } from './calendar.js';
import { mountTasks } from './tasks.js';
import { mountQuickList } from './quick-list.js';
import { mountFootball } from './football.js';
import { mountRss } from './rss.js';
import { mountUnitConverter, mountDateCalculator, mountPercentageCalculator } from './utilities.js';
import { mountBookmarks } from './bookmarks.js';
import { mountToday } from './today.js';
import { mountDiagnostics } from './diagnostics.js';
import { mountPwaHealth } from './pwa-health.js';
import { previewBackup, compareBackupContents, compareOtherBackupSections, backupReminderState } from './backup-preview-core.js';
import { sealBackupArchive, verifyBackupArchive } from './backup-integrity-core.js';
import { createNotesDraftStore } from './notes-draft-core.js';
import { notesDraftInventory, sameNotesDraftInventory } from './backup-guard-core.js';
import { mountSearch } from './search.js';
import { mountQuickAdd } from './quick-add.js';
import { mountTextCounter } from './text-counter.js';
import { mountRandomGenerator } from './random-generator.js';
import { advanceRecentTools, validRecentTools } from './recent-core.js';
import { visibleTools, toggleToolHidden } from './visibility-core.js';
import { orderedTools, moveToolOrder, DEFAULT_TOOL_ORDER } from './tool-order-core.js';
import { addEverydayFavourites } from './settings-layout-core.js';
import { recentContinueTool, shouldCheckForAppUpdate } from './resume-core.js';
import { makeNavState, readNavState, shouldPushRoute, safeScrollY, shouldRunNavigationRequest, isLatestBackEvent } from './navigation-core.js';
import { sanitiseSessionView, shouldRestoreSessionView, safeSessionScroll } from './everyday-view-core.js';

const app=document.querySelector('#app');
let settings={...DEFAULT_SETTINGS};
let history=[];
let active='home';
let cleanup=()=>{};
let stopDiagnostics=()=>{};
let stopPwaHealth=()=>{};
let navigation=Promise.resolve();
// Temporary presentation state only. Never written to history, storage, backups or URLs.
const sessionViews=new Map();
// Only a route identifier and scroll position enter browser history.
// No note contents, draft IDs, search text or personal records are persisted.
let appHistoryReady=false;
let browserBackEpoch=0;
const allowedRoutes=['home','tools','settings','search',...TOOLS.map(tool=>tool.id)];
function updateBrowserHistory(fromRoute,fromScroll,toRoute){
  if(!appHistoryReady || !shouldPushRoute(fromRoute,toRoute))return;
  try{
    window.history.replaceState(makeNavState(fromRoute,fromScroll),'');
    window.history.pushState(makeNavState(toRoute,0),'');
  }catch(err){console.warn('App navigation history is unavailable',err);appHistoryReady=false;}
}
function restoreHistoryAfterRejectedBack(route){
  try{window.history.pushState(makeNavState(route,window.scrollY),'');}
  catch(err){console.warn('Could not preserve navigation history',err);appHistoryReady=false;}
}
function onBrowserBack(event){
  if(!appHistoryReady)return;
  const backEpoch=++browserBackEpoch; // Latest Back/Forward wins over delayed clicks or older popstate events.
  const destination=readNavState(event.state,allowedRoutes)||makeNavState('home');
  navigation=navigation.then(async()=>{
    if(!isLatestBackEvent(backEpoch,browserBackEpoch))return;
    const previous=active;
    if(previous===destination.route){
      window.scrollTo(0,destination.scrollY);
      return;
    }
    try{
      const didNavigate=await navigate(destination.route);
      if(didNavigate){
        // This is a return to a previously visited tool, not a new navigation.
        // Browser already moved to the older history entry; do not push again.
        window.requestAnimationFrame(()=>{
          if(isLatestBackEvent(backEpoch,browserBackEpoch))window.scrollTo(0,destination.scrollY);
        });
      }else if(isLatestBackEvent(backEpoch,browserBackEpoch))restoreHistoryAfterRejectedBack(previous);
    }catch(err){
      if(isLatestBackEvent(backEpoch,browserBackEpoch))restoreHistoryAfterRejectedBack(previous);
      handleError(err);
    }
  }).catch(handleError);
}
window.addEventListener('popstate',onBrowserBack);
let settingsQueue=Promise.resolve();
let waitingWorker=null;
let workerRegistration=null;
let lastWorkerCheck=0;
let workerCheckRunning=false;
let applyingUpdate=false;
let needsRefresh=false;
let hadWorkerController=Boolean(navigator.serviceWorker?.controller);
let toastTimer=null;
let quickAdd=null;
let recentTools=[];
let recentReadOnly=false;
let recentQueue=Promise.resolve();
async function rememberTool(route){
  if(recentReadOnly || !TOOLS.some(tool=>tool.id===route))return;
  recentTools=advanceRecentTools(recentTools,route);
  const snapshot=[...recentTools];
  recentQueue=recentQueue.catch(()=>{}).then(()=>setMeta('recentTools',snapshot));
  try{await recentQueue;}catch(err){console.warn('Recent tools could not be stored',err);}
}
const t=key=>translate(settings.language)(key);
const languageCode=()=>settings.language==='en'?'en-GB':'bg-BG';
const media=matchMedia('(prefers-color-scheme: dark)');

function setTheme(){
  const mode=settings.theme==='auto'?(media.matches?'dark':'light'):settings.theme;
  document.documentElement.dataset.theme=mode;
  document.documentElement.lang=settings.language;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mode==='dark'?'#101725':'#f5f7fb');
}
media.addEventListener?.('change',()=>{if(settings.theme==='auto')setTheme();});
function toast(message){
  const el=document.querySelector('#app-toast');
  if(!el) return;
  el.textContent=String(message);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),3500);
}
function handleError(err){console.error(err);toast(`${t('error')}: ${err?.message || err}`);}
async function updateSettings(change){
  settings=normaliseSettings({...settings,...change});
  setTheme();
  const snapshot=structuredClone(settings);
  settingsQueue=settingsQueue.catch(()=>{}).then(()=>setMeta('settings',snapshot));
  await settingsQueue;
}
async function copyText(value){
  try{
    if(!navigator.clipboard?.writeText) throw Error('Clipboard not available');
    await navigator.clipboard.writeText(value);
    toast(t('copied'));
  }catch{toast(t('copyFailed'));}
}
function shell(){
  quickAdd?.dispose();
  app.innerHTML=`<div class="app-frame">
    <header class="app-header"><button class="brand-link" id="brand-home" type="button" aria-label="${t('home')}"><span class="brand-mark">M<span>·</span></span><span class="brand-text"><strong>MyHub</strong><small>${t('subtitle')}</small></span></button>
      <button class="icon-btn header-settings" id="quick-settings" type="button" aria-label="${t('settings')}">⚙</button></header>
    <div class="update-banner" id="update-banner" hidden><span>${t('updateAvailable')}</span><button type="button" id="update-now" class="primary-btn">${t('updateNow')}</button></div>
    <div class="offline-banner" id="offline-banner" ${navigator.onLine?'hidden':''}>${t('offlineNotice')} · ${t('availableOffline')}</div>
    <main id="main-content" tabindex="-1"></main>
    <nav class="bottom-nav" aria-label="Primary"><button type="button" data-nav="home"><span>⌂</span><small>${t('home')}</small></button>
      <button type="button" data-nav="tools"><span>▦</span><small>${t('tools')}</small></button>
      <button type="button" data-nav="settings"><span>⚙</span><small>${t('settings')}</small></button></nav></div>
    <div id="app-toast" role="status" aria-live="polite"></div>`;
  app.querySelector('#brand-home').addEventListener('click',()=>go('home'));
  app.querySelector('#quick-settings').addEventListener('click',()=>go('settings'));
  app.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.nav)));
  app.querySelector('#update-now').addEventListener('click',async()=>{
    const button=app.querySelector('#update-now');
    if(applyingUpdate||(!waitingWorker&&!needsRefresh))return;
    button.disabled=true;
    try{
      // In-progress editors may reject departure. Never force a reload here.
      if(await cleanup()===false)return;
      if(needsRefresh){applyingUpdate=true;location.reload();return;}
      // A newer worker might have been replaced while cleanup was running.
      const candidate=workerRegistration?.waiting;
      if(!candidate||candidate!==waitingWorker||candidate.state!=='installed'){
        waitingWorker=candidate?.state==='installed'?candidate:null;
        updateIndicators();return;
      }
      applyingUpdate=true;
      candidate.postMessage({type:'SKIP_WAITING'});
    }catch(err){applyingUpdate=false;handleError(err);}
    finally{if(!applyingUpdate)button.disabled=false;}
  });
  quickAdd=mountQuickAdd({element:app,t,notify:toast,openRecord:go});
  updateIndicators();
}
function updateIndicators(){
  const banner=app.querySelector('#offline-banner');
  if(banner)banner.hidden=navigator.onLine;
  const update=app.querySelector('#update-banner');
  if(update) update.hidden=!waitingWorker&&!needsRefresh;
}
window.addEventListener('online',updateIndicators);
window.addEventListener('offline',updateIndicators);
// On Android, returning from another app must NOT remount the current tool:
// Notes may contain text that has not finished saving.
async function checkWorkerOnReturn(){
  updateIndicators();
  if(needsRefresh || !workerRegistration || !shouldCheckForAppUpdate({
    now:Date.now(),lastCheckedAt:lastWorkerCheck,online:navigator.onLine,
    visible:!document.hidden,waiting:!!waitingWorker,inProgress:workerCheckRunning
  }))return;
  lastWorkerCheck=Date.now();
  workerCheckRunning=true;
  try{
    await workerRegistration.update();
    if(workerRegistration.waiting && navigator.serviceWorker.controller){
      waitingWorker=workerRegistration.waiting;updateIndicators();
    }
  }catch(err){console.warn('Background PWA update check unavailable',err);}
  finally{workerCheckRunning=false;}
}
function onAppReturn(){
  updateIndicators();
  if(!document.hidden)void checkWorkerOnReturn();
}
document.addEventListener('visibilitychange',onAppReturn);
window.addEventListener('pageshow',onAppReturn);
window.addEventListener('online',onAppReturn);
function go(route, selection=null){
  const epochAtClick=browserBackEpoch;
  navigation=navigation.then(async()=>{
    // Repeated taps on the active tool must not dismiss a draft or lose scroll.
    // Back/Forward invalidates earlier queued clicks, but not newer user actions.
    if(!shouldRunNavigationRequest(epochAtClick,browserBackEpoch,active,route,selection!==null&&selection!==undefined))return;
    const fromRoute=active;
    const fromScroll=safeScrollY(window.scrollY);
    const didNavigate=await navigate(route,selection);
    if(didNavigate && epochAtClick===browserBackEpoch)updateBrowserHistory(fromRoute,fromScroll,active);
  }).catch(handleError);
}
async function navigate(route,selection=null){
  // Capture the previous screen before cleanup destroys the DOM. Keep the
  // snapshot only if navigation succeeds; a rejected unsaved edit stays intact.
  const previousRoute=active;
  const previousScroll=safeSessionScroll(window.scrollY);
  const previousView=typeof cleanup.getViewState==='function'
    ? sanitiseSessionView(previousRoute,cleanup.getViewState()) : null;
  if(await cleanup()===false)return false;
  sessionViews.set(previousRoute,{scrollY:previousScroll,view:previousView});
  cleanup=()=>{};
  if(!allowedRoutes.includes(route))route='home';
  active=route;
  const remembered=shouldRestoreSessionView(selection)?sessionViews.get(route):null;
  shell();
  const main=app.querySelector('#main-content');
  if(route==='home') renderHome(main);
  if(route==='tools') renderTools(main);
  if(route==='settings') renderSettings(main,false,false,selection?.panel==='favourites');
  if(route==='search') cleanup=await mountSearch({element:main,lang:settings.language,t,tools:visibleTools(TOOLS,settings.hiddenTools),viewState:remembered?.view,openResult:go});
  if(route==='calculator') cleanup=mountCalculator({element:main,t,history,
    saveHistory:async list=>{history=list;await setMeta('calcHistory',list);},
    copyText,confirmAction:window.confirm,lang:settings.language});
  if(route==='clock') cleanup=mountWorldClock({element:main,t,lang:settings.language,
    timeZones:settings.timeZones,saveZones:timeZones=>updateSettings({timeZones})});
  if(route==='notes') cleanup=await mountNotes({element:main,t,lang:settings.language,
    confirmAction:window.confirm,notify:toast,initialId:selection?.id,viewState:remembered?.view,onQuickDraft:draft=>quickAdd?.openPrefilled(draft)});
  if(route==='weather') cleanup=mountWeather({element:main,t,lang:settings.language,
    weatherCities:settings.weatherCities,weatherSelectedId:settings.weatherSelectedId,viewState:remembered?.view,
    saveWeather:change=>updateSettings(change),notify:toast});
  if(route==='timer') cleanup=await mountTimer({element:main,t,lang:settings.language,notify:toast});
  if(route==='calendar') cleanup=await mountCalendar({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm,initialId:selection?.id,initialDate:selection?.date,showDay:selection?.showDay===true,onQuickDraft:draft=>quickAdd?.openPrefilled(draft)});
  if(route==='tasks') cleanup=await mountTasks({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm,initialId:selection?.id,onQuickDraft:draft=>quickAdd?.openPrefilled(draft)});
  if(route==='quicklist') cleanup=await mountQuickList({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm,initialId:selection?.id});
  if(route==='football') cleanup=await mountFootball({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm,viewState:remembered?.view});
  if(route==='rss') cleanup=await mountRss({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm});
  if(route==='unit') cleanup=await mountUnitConverter({element:main,lang:settings.language,notify:toast});
  if(route==='datecalc') cleanup=mountDateCalculator({element:main,lang:settings.language});
  if(route==='percentage') cleanup=mountPercentageCalculator({element:main,lang:settings.language,notify:toast});
  if(route==='bookmarks') cleanup=await mountBookmarks({element:main,lang:settings.language,notify:toast,confirmAction:window.confirm,initialId:selection?.id});
  if(route==='textcounter') cleanup=mountTextCounter({element:main,lang:settings.language,notify:toast,copyText,confirmAction:window.confirm});
  if(route==='random') cleanup=mountRandomGenerator({element:main,lang:settings.language,notify:toast,copyText});
  app.querySelectorAll('[data-nav]').forEach(button=>{
    const selected=button.dataset.nav===route||(route!=='home'&&route!=='tools'&&route!=='settings'&&button.dataset.nav==='tools');
    button.classList.toggle('active',selected);
    if(selected)button.setAttribute('aria-current','page');
  });
  await rememberTool(route);
  quickAdd?.setVisible(route);
  window.scrollTo(0,0);
  // Returning via a tool tile or "Continue" should resume the same approximate
  // scroll position, after the module has mounted. A specific record always
  // starts at the top. Android Back/Forward still uses its history scroll value.
  if(remembered?.scrollY){
    const returningRoute=route,offset=safeSessionScroll(remembered.scrollY);
    window.requestAnimationFrame(()=>{
      if(active===returningRoute)window.scrollTo(0,offset);
    });
  }
  return true;
}
function tile(tool){
  return `<button class="tool-tile" type="button" data-open="${tool.id}"><span class="tool-icon ${tool.color}">${tool.icon}</span>
    <strong>${t(tool.title)}</strong><small>${t(tool.description)}</small><span class="tile-arrow" aria-hidden="true">↗</span></button>`;
}
function bindToolButtons(container){
  container.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.open)));
}
function renderHome(main){
  const favorites=settings.favourites.map(id=>TOOLS.find(tool=>tool.id===id)).filter(tool=>tool&&!settings.hiddenTools.includes(tool.id));
  const continueTool=recentContinueTool(recentTools,TOOLS,settings.hiddenTools);
  main.innerHTML=`<section class="home-hero"><div class="eyebrow">PERSONAL TOOLS · ${VERSION}</div>
    <h1>${t('welcome')}</h1><p>${t('welcomeSub')}</p>
    <div class="today-widget"><span class="today-symbol">☼</span><div><small>${t('dateCard')}</small><strong id="home-date"></strong></div><strong class="today-time" id="home-time"></strong></div></section>
    <div id="today-summary-slot"></div>
    ${continueTool?`<div class="home-continue-wrap"><button type="button" class="home-continue" id="continue-last-tool" aria-label="${t('continueLastTool')}: ${t(continueTool.title)}"><span class="home-continue-icon" aria-hidden="true">${continueTool.icon}</span><span class="home-continue-copy"><small>${t('continueLastTool')}</small><strong>${t(continueTool.title)}</strong></span><span class="home-continue-arrow" aria-hidden="true">↗</span></button></div>`:''}
    <section class="section"><div class="row-between"><h2>${t('myFavourites')}</h2><button class="text-link" id="customise-home" type="button">${t('settings')} ›</button></div>
    <div id="home-favourites" class="tiles-grid">${favorites.map(tile).join('') || `<p class="muted">${t('noFavourites')}</p>`}</div></section>
    <section class="section"><div class="row-between"><h2>${t('allTools')}</h2><button class="text-link" id="all-tools-link" type="button">${t('tools')} ›</button></div>
    <button type="button" id="home-universal-search" class="hub-search-launch"><span aria-hidden="true">⌕</span><span>${t('universalSearch')}</span><span aria-hidden="true">›</span></button></section>
    <p class="privacy-footer">◈ ${t('safeOffline')}</p>`;
  const showDate=()=>{
    const date=main.querySelector('#home-date');const time=main.querySelector('#home-time');
    if(date)date.textContent=humanDate(new Date(),settings.language);
    if(time)time.textContent=new Intl.DateTimeFormat(languageCode(),{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  };
  showDate();
  const minuteTimer=setInterval(showDate,15000);
  const stopToday=mountToday({element:main.querySelector('#today-summary-slot'),lang:settings.language,openTool:go,notify:toast});
  cleanup=()=>{clearInterval(minuteTimer);stopToday();};
  bindToolButtons(main);
  main.querySelector('#continue-last-tool')?.addEventListener('click',()=>go(continueTool.id));
  main.querySelector('#customise-home').addEventListener('click',()=>go('settings',{panel:'favourites'}));
  main.querySelector('#all-tools-link').addEventListener('click',()=>go('tools'));
  main.querySelector('#home-universal-search').addEventListener('click',()=>go('search'));
}
function renderTools(main){
  const shown=visibleTools(orderedTools(TOOLS,settings.toolOrder),settings.hiddenTools);
  const recent=recentTools.map(id=>shown.find(tool=>tool.id===id)).filter(Boolean);
  main.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / ${VERSION}</span><h1>${t('allTools')}</h1><p>${t('availableOffline')}</p></section><button type="button" class="hub-search-launch hub-tools-search" id="tools-universal-search"><span aria-hidden="true">⌕</span><span>${t('universalSearch')}</span><span aria-hidden="true">›</span></button>
    ${recent.length?`<section class="recent-tools"><h2>${t('recentTools')}</h2><div class="recent-tool-row">${recent.map(tool=>`<button type="button" class="recent-tool" data-open="${tool.id}"><span aria-hidden="true">${tool.icon}</span>${t(tool.title)}</button>`).join('')}</div></section>`:''}
    <div class="tiles-grid">${shown.map(tile).join('')||`<div class="surface tools-empty"><p class="muted">${t('allToolsHidden')}</p><button type="button" class="secondary-btn" id="manage-visible">${t('manageTools')}</button></div>`}</div>`;
  bindToolButtons(main);
  main.querySelector('#tools-universal-search').addEventListener('click',()=>go('search'));
  main.querySelector('#manage-visible')?.addEventListener('click',()=>go('settings'));
}
function settingsToolRow(id, idx){
  const tool=TOOLS.find(item=>item.id===id);
  const activeFavourite=settings.favourites.includes(id);
  const position=settings.favourites.indexOf(id);
  return `<div class="setting-tool"><span class="tool-icon mini ${tool.color}">${tool.icon}</span><span class="setting-tool-name">${t(tool.title)}</span>
    <label class="switch"><input type="checkbox" data-favourite="${id}" ${activeFavourite?'checked':''} aria-label="${t('visible')} ${t(tool.title)}"><span></span></label>
    <button type="button" class="icon-btn small" data-reorder="${id}:up" title="${t('moveUp')}" aria-label="${t('moveUp')} ${t(tool.title)}" ${position<=0?'disabled':''}>↑</button>
    <button type="button" class="icon-btn small" data-reorder="${id}:down" title="${t('moveDown')}" aria-label="${t('moveDown')} ${t(tool.title)}" ${position<0||position===settings.favourites.length-1?'disabled':''}>↓</button></div>`;
}
function renderSettings(main,openHidden=false,openOrder=false,openFavourites=false,openRecent=false){
  stopDiagnostics();
  stopPwaHealth();
  const order=[...settings.favourites,...TOOLS.map(tool=>tool.id).filter(id=>!settings.favourites.includes(id))];
  const currentOrder=orderedTools(TOOLS,settings.toolOrder);
  main.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / ${VERSION}</span><h1>${t('settings')}</h1><p>${t('introSettings')}</p></section>
    <section class="surface setting-section"><h2>${t('theme')}</h2><div class="choice-row" role="group" aria-label="${t('theme')}">
      ${['light','dark','auto'].map(val=>`<button type="button" class="choice-btn ${settings.theme===val?'selected':''}" data-theme-choice="${val}" aria-pressed="${settings.theme===val}">${t(val)}</button>`).join('')}</div>
      <h2 class="setting-subhead">${t('language')}</h2><div class="choice-row" role="group" aria-label="${t('language')}">
      <button type="button" class="choice-btn ${settings.language==='bg'?'selected':''}" data-lang-choice="bg" aria-pressed="${settings.language==='bg'}">Български</button>
      <button type="button" class="choice-btn ${settings.language==='en'?'selected':''}" data-lang-choice="en" aria-pressed="${settings.language==='en'}">English</button></div></section>
    <section class="surface setting-section"><details class="tool-visibility" id="favourite-settings" ${openFavourites?'open':''}>
      <summary><strong>${t('customise')}</strong><span class="muted">${t('favouritesCount')}: ${settings.favourites.length} · ${t('tapToManage')}</span></summary>
      <p class="muted">${t('customiseHint')}</p>
      <div class="everyday-tools-shortcut"><span class="muted">${t('everydayShortcutHint')}</span>
        <button type="button" class="secondary-btn" id="add-everyday-tools" ${settings.favourites.includes('notes')&&settings.favourites.includes('weather')&&!settings.hiddenTools.includes('notes')&&!settings.hiddenTools.includes('weather')?'disabled':''}>${t('everydayShortcut')}</button></div>
      <div class="settings-tools">${order.map(settingsToolRow).join('')}</div>
      </details></section>
    <section class="surface setting-section"><details class="tool-visibility" id="tool-order" ${openOrder?'open':''}>
      <summary><strong>${t('sortAllTools')}</strong><span class="muted">${t('tapToManage')}</span></summary>
      <p class="muted">${t('sortAllToolsHint')}</p>
      <div class="settings-tools tool-order-list">${currentOrder.map((tool,index)=>`<div class="setting-tool tool-order-row">
        <span class="tool-icon mini ${tool.color}" aria-hidden="true">${tool.icon}</span>
        <span class="setting-tool-name">${t(tool.title)}${settings.hiddenTools.includes(tool.id)?`<small class="order-hidden-note">${t('hiddenLabel')}</small>`:''}</span>
        <button type="button" class="icon-btn small" data-tool-order="${tool.id}:up" title="${t('moveUp')}" aria-label="${t('moveUp')} ${t(tool.title)}" ${index===0?'disabled':''}>↑</button>
        <button type="button" class="icon-btn small" data-tool-order="${tool.id}:down" title="${t('moveDown')}" aria-label="${t('moveDown')} ${t(tool.title)}" ${index===currentOrder.length-1?'disabled':''}>↓</button></div>`).join('')}</div>
      <div class="visibility-footer"><button type="button" id="reset-tool-order" class="secondary-btn" ${settings.toolOrder.every((id,index)=>id===DEFAULT_TOOL_ORDER[index])?'disabled':''}>${t('resetToolOrder')}</button></div>
      </details></section>
    <section class="surface setting-section"><details class="tool-visibility" id="tool-visibility" ${openHidden?'open':''}>
      <summary><strong>${t('manageTools')}</strong><span class="muted">${t('hiddenCount')}: ${settings.hiddenTools.length} · ${t('tapToManage')}</span></summary>
      <p class="muted">${t('hiddenToolsHint')}</p>
      <div class="settings-tools">${TOOLS.map(tool=>`<div class="setting-tool"><span class="tool-icon mini ${tool.color}" aria-hidden="true">${tool.icon}</span><label for="shown-${tool.id}" class="setting-tool-name">${t(tool.title)}</label>
        <label class="switch"><input id="shown-${tool.id}" type="checkbox" data-tool-visible="${tool.id}" ${settings.hiddenTools.includes(tool.id)?'':'checked'} aria-label="${t('visible')} ${t(tool.title)}"><span></span></label></div>`).join('')}</div>
      <div class="visibility-footer"><button type="button" id="show-all-tools" class="secondary-btn" ${settings.hiddenTools.length?'':'disabled'}>${t('showAllTools')}</button></div>
      </details></section>
    <section class="surface setting-section"><details class="tool-visibility" id="recent-settings" ${openRecent?'open':''}>
      <summary><strong>${t('recentTools')}</strong><span class="muted">${t('tapToManage')}</span></summary>
      <p class="muted">${recentReadOnly?t('recentCorrupt'):recentTools.map(id=>t(TOOLS.find(tool=>tool.id===id)?.title||'')).join(' · ')||t('none')}</p>
      <button type="button" class="secondary-btn" id="clear-recent">${t('clearRecent')}</button>
      </details></section>
    <section class="surface setting-section"><h2>${t('dataBackup')}</h2><p class="muted">${t('backupHint')}</p>
      <div class="backup-reminder-control"><label for="backup-reminder-days">${settings.language==='en'?'Backup reminder (only in Settings)':'Напомняне за архив (само в Настройки)'}</label>
        <select id="backup-reminder-days" aria-label="${settings.language==='en'?'Backup reminder':'Напомняне за архив'}">
          ${[[0,settings.language==='en'?'Off':'Изключено'],[7,settings.language==='en'?'7 days':'7 дни'],[14,settings.language==='en'?'14 days':'14 дни'],[30,settings.language==='en'?'30 days':'30 дни']].map(([value,label])=>`<option value="${value}" ${settings.backupReminderDays===value?'selected':''}>${label}</option>`).join('')}
        </select></div>
      <div id="backup-reminder-status" class="backup-reminder-status" role="status" aria-live="polite"></div>
      <div class="backup-actions"><button type="button" class="primary-btn" id="export-backup">↓ ${t('exportBackup')}</button>
      <button type="button" class="secondary-btn" id="import-backup">↑ ${t('importBackup')}</button>
      <input type="file" id="backup-file" accept=".json,application/json" hidden></div>
      <div id="backup-preview" class="backup-preview" hidden></div>
      <p class="warning-text">${t('importWarning')}</p>
      <button type="button" class="text-link" id="persistent-storage">${t('storagePersist')} ›</button></section>
    <section class="surface setting-section"><details class="tool-visibility" id="diagnostics-panel">
      <summary><strong>${t('diagnosticsAdvanced')}</strong><span class="muted">${t('tapToManage')}</span></summary>
      <div id="health-section" class="settings-diagnostics-body"></div>
      </details></section>
    <section class="surface setting-section" id="pwa-health-section"></section>
    <section class="surface setting-section"><h2>${t('installation')}</h2><p class="muted">${t('installHint')}</p>
      <div class="row-between"><span>${t('appVersion')}</span><strong>v${VERSION}</strong></div>
      <p class="privacy-footer">🔒 ${t('privacy')}</p></section>`;
  stopDiagnostics=mountDiagnostics({element:main.querySelector('#health-section'),lang:settings.language});
  stopPwaHealth=mountPwaHealth({element:main.querySelector('#pwa-health-section'),lang:settings.language,onWaiting:worker=>{waitingWorker=worker;updateIndicators();}});
  const reminderText=main.querySelector('#backup-reminder-status');
  const refreshReminder=async()=>{
    try{
      const timestamp=await getMeta('lastBackupExportAt');
      if(!reminderText.isConnected)return;
      const info=backupReminderState(timestamp,settings.backupReminderDays);
      const lang=settings.language;
      reminderText.classList.toggle('backup-reminder-due',info.due);
      reminderText.textContent=!info.enabled
        ?(lang==='en'?'Reminder disabled.':'Напомнянето е изключено.')
        :info.daysSince===null
          ?(lang==='en'?'No prepared backup recorded. Create a backup and check Downloads.':'Няма записан подготвен архив. Направи архив и провери Downloads.')
          :info.due
            ?(lang==='en'?`Last prepared ${info.daysSince} days ago — a new backup is recommended.`:`Последният подготвен архив е отпреди ${info.daysSince} дни — препоръчва се нов.`)
            :(lang==='en'?`Last prepared ${info.daysSince} days ago.`:`Последният подготвен архив е отпреди ${info.daysSince} дни.`);
    }catch(err){if(reminderText.isConnected)reminderText.textContent=settings.language==='en'?'Backup status unavailable.':'Състоянието на архивите не е достъпно.';}
  };
  void refreshReminder();
  main.querySelector('#backup-reminder-days').addEventListener('change',async event=>{
    try{await updateSettings({backupReminderDays:Number(event.target.value)});await refreshReminder();}
    catch(err){handleError(err);event.target.value=String(settings.backupReminderDays);}
  });
  cleanup=()=>{stopDiagnostics();stopPwaHealth();};
  main.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.addEventListener('click',async()=>{
    try{await updateSettings({theme:btn.dataset.themeChoice}); renderSettings(main);}catch(err){handleError(err);}
  }));
  main.querySelectorAll('[data-lang-choice]').forEach(btn=>btn.addEventListener('click',async()=>{
    try{await updateSettings({language:btn.dataset.langChoice});go('settings');}catch(err){handleError(err);}
  }));
  main.querySelector('#add-everyday-tools').addEventListener('click',async()=>{
    const change=addEverydayFavourites(settings.favourites,settings.hiddenTools);
    if(!change.changed)return;
    try{
      await updateSettings({favourites:change.favourites,hiddenTools:change.hiddenTools});
      renderSettings(main,false,false,true);
      toast(t('everydayShortcutDone'));
    }catch(err){handleError(err);}
  });
  main.querySelectorAll('[data-favourite]').forEach(check=>check.addEventListener('change',async()=>{
    const id=check.dataset.favourite;
    const fav=settings.favourites.filter(x=>x!==id);
    if(check.checked)fav.push(id);
    try{await updateSettings({favourites:fav});renderSettings(main,false,false,true);}catch(err){handleError(err);}
  }));
  main.querySelectorAll('[data-reorder]').forEach(btn=>btn.addEventListener('click',async()=>{
    const [id,direction]=btn.dataset.reorder.split(':');
    const fav=[...settings.favourites];
    const index=fav.indexOf(id),target=index+(direction==='up'?-1:1);
    if(index<0||target<0||target>=fav.length)return;
    [fav[index],fav[target]]=[fav[target],fav[index]];
    try{await updateSettings({favourites:fav});renderSettings(main,false,false,true);}catch(err){handleError(err);}
  }));
  main.querySelectorAll('[data-tool-order]').forEach(btn=>btn.addEventListener('click',async()=>{
    const [id,direction]=btn.dataset.toolOrder.split(':');
    try{
      const toolOrder=moveToolOrder(settings.toolOrder,id,direction);
      await updateSettings({toolOrder});
      renderSettings(main,false,true);
    }catch(err){handleError(err);}
  }));
  main.querySelector('#reset-tool-order').addEventListener('click',async()=>{
    try{await updateSettings({toolOrder:[...DEFAULT_TOOL_ORDER]});renderSettings(main,false,true);}
    catch(err){handleError(err);}
  });
  main.querySelectorAll('[data-tool-visible]').forEach(input=>input.addEventListener('change',async()=>{
    const id=input.dataset.toolVisible;
    try{await updateSettings({hiddenTools:toggleToolHidden(settings.hiddenTools,id)});renderSettings(main,true);}
    catch(err){input.checked=!input.checked;handleError(err);}
  }));
  main.querySelector('#show-all-tools').addEventListener('click',async()=>{
    try{await updateSettings({hiddenTools:[]});renderSettings(main,true);}catch(err){handleError(err);}
  });
  main.querySelector('#clear-recent').addEventListener('click',async()=>{
    try{await recentQueue.catch(()=>{});await setMeta('recentTools',[]);recentTools=[];recentReadOnly=false;toast(t('recentCleared'));renderSettings(main,false,false,false,true);}catch(err){handleError(err);}
  });
  main.querySelector('#export-backup').addEventListener('click',async()=>{
    try{
      const data=await sealBackupArchive(await createBackup());
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download=`MyHub-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000); // Android download hand-off can be delayed
      // Records that an export was initiated, NOT that Android saved the file.
      try{await setMeta('lastBackupExportAt',new Date().toISOString());await refreshReminder();}catch(err){console.warn('Backup date unavailable',err);}
    }catch(err){handleError(err);toast(t('exportFailed'));}
  });
  const fileInput=main.querySelector('#backup-file');
  const previewElement=main.querySelector('#backup-preview');
  const draftsNow=()=>{
    let storage=null;
    try { storage=window.localStorage; } catch { /* browser may block storage */ }
    return notesDraftInventory(createNotesDraftStore(storage));
  };
  const previewWords=settings.language==='en'
    ?{heading:'Checked archive — compare before replacing',date:'Created',version:'Archive version',legacy:'Older archive: absent sections will be restored to defaults (often empty).',counts:['Notes','Templates','Trash','Tasks','Events','Quick lists','Bookmarks','RSS articles','Football leagues'],confirm:'Replace local data',cancel:'Cancel',ready:'No local data has been changed.',working:'Restoring…',current:'Now',incoming:'After Restore',removed:'Missing from archive',changed:'Different existing records',comparisonFail:'Unable to compare existing data. Restore would still replace everything; take care.',safe:'Nothing missing among the nine compared record types. Settings and other content will still be replaced.',risk:'Some local records are missing from this archive.',ack:'I understand Restore REPLACES all local data and cannot be undone without a separate backup.',notAcknowledged:'Tick the confirmation box before restoring.',integrityOK:'SHA-256 verified — archive matches its checksum.',integrityLegacy:'Older archive without checksum — structure was checked, but file integrity cannot be verified.',otherHeading:'Other data that will be replaced',otherLabels:{settings:'Settings',calcHistory:'Calculator history',weatherCache:'Weather cache',timerData:'Timer state',unitFavouritesData:'Favourite conversions',recentTools:'Recently used tools'},draftsWarning:'Notes recovery drafts: {count} valid, {corrupt} damaged. They are NOT in JSON Backup. Restore will not remove them, but saved Notes may differ afterwards.',draftsUnavailable:'Draft storage could not be checked. Check Notes first.',draftAck:'I understand the risk to Notes drafts and want to continue.',draftsChanged:'Notes drafts changed during the preview. Choose the archive again.'}
    :{heading:'Проверен архив — сравнение преди заместване',date:'Създаден',version:'Версия на архива',legacy:'Стар архив: липсващите раздели ще получат началните си стойности (често празни).',counts:['Бележки','Шаблони','Кошче','Задачи','Събития','Бързи списъци','Връзки','RSS статии','Футболни първенства'],confirm:'Замени локалните данни',cancel:'Отказ',ready:'Все още нищо не е променено.',working:'Възстановяване…',current:'Сега',incoming:'След Restore',removed:'Липсват в архива',changed:'Различни съществуващи записи',comparisonFail:'Не мога да сравня текущите данни. Restore въпреки това ще ги замени изцяло — бъди внимателен.',safe:'В деветте проверявани вида записи няма липсващи ID. Настройките и съдържанието пак ще бъдат заменени.',risk:'В този архив липсват някои текущи записи.',ack:'Разбирам, че Restore ЗАМЕНЯ всички локални данни и не може да бъде отменен без отделен архив.',notAcknowledged:'Маркирай полето за потвърждение преди Restore.',integrityOK:'SHA-256 е проверен — съдържанието съответства на контролния отпечатък.',integrityLegacy:'Стар архив без контролен отпечатък — структурата е проверена, но не може да се потвърди целостта на файла.',otherHeading:'Други данни, които ще бъдат заменени',otherLabels:{settings:'Настройки',calcHistory:'История на калкулатора',weatherCache:'Кеш на времето',timerData:'Състояние на таймера',unitFavouritesData:'Любими преобразувания',recentTools:'Последни инструменти'},draftsWarning:'Чернови за възстановяване от Notes: {count} валидни, {corrupt} повредени. Те НЕ влизат в JSON Backup. Restore няма да ги изтрие, но записаните бележки може да станат различни.',draftsUnavailable:'Не успях да проверя хранилището на черновите. Провери Notes.',draftAck:'Разбирам риска за черновите в Notes и искам да продължа.',draftsChanged:'Черновите на Notes са се променили след прегледа. Избери архива отново.'};
  function cancelPreview(){pendingBackup=null;pendingGuard=null;pendingDrafts=null;previewElement.replaceChildren();previewElement.hidden=true;}
  let pendingBackup=null;
  let pendingGuard=null;
  let pendingDrafts=null;
  let importEpoch=0;
  main.querySelector('#import-backup').addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const epoch=++importEpoch;
    const file=fileInput.files?.[0];fileInput.value='';cancelPreview();
    if(!file)return;
    try{
      if(file.size>20_000_000)throw Error('File exceeds 20 MB');
      const data=JSON.parse(await file.text());
      const cleaned=validateBackup(data);
      const checksum=await verifyBackupArchive(data);
      if(epoch!==importEpoch)return;
      const summary=previewBackup(data,cleaned);
      // Comparing cannot modify local content. If local data is corrupt, allow
      // selecting a known-good archive but display an explicit warning.
      let comparison=null,otherDifferences=[];
      // The preview and guard refer to one committed, read-only snapshot.
      // Even when current data is damaged, Restore must not overwrite newer edits.
      const guard=await readBackupSnapshot();
      try{
        const current=validateBackup(await createBackup(guard));
        comparison=compareBackupContents(current,cleaned);
        otherDifferences=compareOtherBackupSections(current,cleaned);
      }catch(err){console.warn('Current data comparison not available',err);}
      if(epoch!==importEpoch)return;
      const draftRisk=draftsNow();
      pendingBackup=data;
      pendingGuard=guard;
      pendingDrafts=draftRisk;
      const created=summary.createdAt?new Intl.DateTimeFormat(languageCode(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(summary.createdAt)):'—';
      const lost=comparison?.some(item=>item.removed>0);
      const changed=comparison?.some(item=>item.changed>0);
      previewElement.innerHTML=`<h3>${previewWords.heading}</h3><p>${previewWords.date}: <strong>${escapeHtml(created)}</strong> · ${previewWords.version}: <strong>${escapeHtml(summary.version||'—')}</strong></p>
        ${comparison?`<div class="backup-compare-list">${comparison.map((entry,i)=>`<div class="backup-compare-row"><strong>${previewWords.counts[i]}</strong><span>${previewWords.current}: ${entry.current} → ${previewWords.incoming}: ${entry.incoming}</span>${entry.removed||entry.changed?`<small class="warning-text">${entry.removed?`${previewWords.removed}: ${entry.removed}`:''}${entry.removed&&entry.changed?' · ':''}${entry.changed?`${previewWords.changed}: ${entry.changed}`:''}</small>`:''}</div>`).join('')}</div>`:''}
        <p class="${!comparison||lost||changed?'warning-text':'muted'}">${!comparison?previewWords.comparisonFail:lost?previewWords.risk:previewWords.safe}</p>
        ${otherDifferences.length?`<p class="warning-text"><strong>${previewWords.otherHeading}:</strong> ${otherDifferences.map(key=>escapeHtml(previewWords.otherLabels[key]||key)).join(', ')}</p>`:''}
        ${summary.missing.length?`<p class="warning-text">${previewWords.legacy}</p>`:''}
        <p class="${checksum.status==='verified'?'muted':'warning-text'}">${checksum.status==='verified'?previewWords.integrityOK:previewWords.integrityLegacy}</p>
        ${draftRisk.needsAcknowledgement?`<p class="warning-text" role="alert">${draftRisk.unavailable?previewWords.draftsUnavailable:previewWords.draftsWarning.replace('{count}',String(draftRisk.count)).replace('{corrupt}',String(draftRisk.corrupt))}</p>`:''}
        <p class="muted">${previewWords.ready}</p>
        <label class="backup-acknowledge"><input type="checkbox" id="backup-ack-check"><span>${previewWords.ack}</span></label>
        ${draftRisk.needsAcknowledgement?`<label class="backup-acknowledge"><input type="checkbox" id="backup-draft-ack"><span>${previewWords.draftAck}</span></label>`:''}
        <div class="backup-actions"><button type="button" class="danger-btn" id="confirm-backup-restore" disabled>${previewWords.confirm}</button><button type="button" class="secondary-btn" id="cancel-backup-restore">${previewWords.cancel}</button></div>`;
      previewElement.hidden=false;
      const confirmButton=previewElement.querySelector('#confirm-backup-restore');
      const ack=previewElement.querySelector('#backup-ack-check');
      const draftAck=previewElement.querySelector('#backup-draft-ack');
      const ready=()=>{confirmButton.disabled=!ack.checked || Boolean(draftAck && !draftAck.checked);};
      ack.addEventListener('change',ready);
      draftAck?.addEventListener('change',ready);
      previewElement.querySelector('#cancel-backup-restore').addEventListener('click',cancelPreview);
      confirmButton.addEventListener('click',async()=>{
        if(!pendingBackup || !ack.checked || (draftAck && !draftAck.checked)){toast(previewWords.notAcknowledged);return;}
        if(!sameNotesDraftInventory(pendingDrafts,draftsNow())){cancelPreview();toast(previewWords.draftsChanged);return;}
        if(!window.confirm(t('importConfirm')))return;
        confirmButton.disabled=true;confirmButton.textContent=previewWords.working;
        try{
          // Re-check the exact Notes drafts and the archive after confirmation.
          if(!sameNotesDraftInventory(pendingDrafts,draftsNow())){cancelPreview();toast(previewWords.draftsChanged);return;}
          await verifyBackupArchive(pendingBackup);
          if(!sameNotesDraftInventory(pendingDrafts,draftsNow())){cancelPreview();toast(previewWords.draftsChanged);return;}
          // Validate again before the atomic IndexedDB transaction.
          await replaceFromBackup(pendingBackup,pendingGuard);
          pendingBackup=null;
          toast(t('restored'));location.reload();
        }catch(err){
          console.error(err);
          if(err?.code==='stale-preview'){
            cancelPreview();
            toast(settings.language==='en'?'Local data changed. Select the backup again to review it.':'Данните са променени след прегледа. Избери архива отново.');
          }else{
            confirmButton.disabled=false;confirmButton.textContent=previewWords.confirm;toast(t('importFailed'));
          }
        }
      });
    }catch(err){console.error(err);cancelPreview();toast(t('invalidBackup')+err.message);}
  });
  main.querySelector('#persistent-storage').addEventListener('click',async()=>{
    try{
      const allowed=await navigator.storage?.persist?.();
      toast(t(allowed?'storagePersistSuccess':'storagePersistDenied'));
    }catch{toast(t('storagePersistDenied'));}
  });
}
function registerWorker(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    const previousController=hadWorkerController;
    hadWorkerController=Boolean(navigator.serviceWorker.controller);
    if(applyingUpdate){location.reload();return;}
    waitingWorker=null;
    // A different tab can activate a new worker. Do not mix its assets
    // with the code in this tab or reload and discard unfinished edits.
    if(previousController&&hadWorkerController)needsRefresh=true;
    updateIndicators();
  });
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    workerRegistration=reg;lastWorkerCheck=Date.now();
    if(reg.waiting && navigator.serviceWorker.controller){waitingWorker=reg.waiting;updateIndicators();}
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      worker?.addEventListener('statechange',()=>{
        if(worker.state==='installed' && navigator.serviceWorker.controller){waitingWorker=worker;updateIndicators();}
      });
    });
  }).catch(err=>console.warn('Service worker unavailable',err));
}
async function boot(){
  try{
    await openDatabase();
    settings=normaliseSettings(await getMeta('settings'));
    const storedRecent=await getMeta('recentTools');
    recentReadOnly=storedRecent!==undefined&&!validRecentTools(storedRecent);
    recentTools=recentReadOnly?[]:storedRecent===undefined?[]:storedRecent;
    history=await getMeta('calcHistory') || [];
    if(!Array.isArray(history))history=[];
    history=history.filter(item=>item && typeof item.expression==='string' &&
      typeof item.result==='string' && typeof item.at==='string').slice(0,30);
    setTheme();
    // Only a local record id may be passed in the URL. Shared content never goes here.
    const params=new URL(location.href).searchParams;
    const requested=params.get('myhubOpen');
    const recordId=params.get('id');
    if(['bookmarks','notes'].includes(requested) && recordId && /^[A-Za-z0-9-]{1,100}$/.test(recordId)){
      window.history.replaceState(null,'',location.pathname);
      await navigate(requested,{id:recordId});
    }else{
      await navigate('home');
    }
    // Browser Back inside the installed PWA returns to earlier MyHub screens.
    // Safe cleanup is still required before any view can be abandoned.
    try{
      window.history.replaceState(makeNavState(active,0),'');
      if('scrollRestoration' in window.history)window.history.scrollRestoration='manual';
      appHistoryReady=true;
    }catch(err){console.warn('In-app Back is not available',err);}
    registerWorker();
  }catch(err){
    console.error(err);
    app.innerHTML=`<main class="fatal-error"><h1>MyHub</h1><p>${t('storageError')}</p><p class="muted">${escapeHtml(err.message)}</p></main>`;
  }
}
void boot();
