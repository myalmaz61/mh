import { VERSION, TOOLS, DEFAULT_SETTINGS } from './config.js';
import { translate } from './i18n.js';
import { escapeHtml, humanDate } from './utils.js';
import { openDatabase, getMeta, setMeta, getNotes, normaliseSettings, createBackup, replaceFromBackup, validateBackup } from './db.js';
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
import { mountSearch } from './search.js';
import { mountQuickAdd } from './quick-add.js';
import { mountTextCounter } from './text-counter.js';
import { mountRandomGenerator } from './random-generator.js';
import { advanceRecentTools, validRecentTools } from './recent-core.js';

const app=document.querySelector('#app');
let settings={...DEFAULT_SETTINGS};
let history=[];
let active='home';
let cleanup=()=>{};
let stopDiagnostics=()=>{};
let navigation=Promise.resolve();
let settingsQueue=Promise.resolve();
let waitingWorker=null;
let applyingUpdate=false;
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
    if(!waitingWorker)return;
    try {await cleanup(); applyingUpdate=true; waitingWorker.postMessage({type:'SKIP_WAITING'});}catch(err){handleError(err);}
  });
  quickAdd=mountQuickAdd({element:app,t,notify:toast,openRecord:go});
  updateIndicators();
}
function updateIndicators(){
  const banner=app.querySelector('#offline-banner');
  if(banner)banner.hidden=navigator.onLine;
  const update=app.querySelector('#update-banner');
  if(update) update.hidden=!waitingWorker;
}
window.addEventListener('online',updateIndicators);
window.addEventListener('offline',updateIndicators);
function go(route, selection=null){
  navigation=navigation.then(()=>navigate(route,selection)).catch(handleError);
}
async function navigate(route,selection=null){
  await cleanup();
  cleanup=()=>{};
  if(!['home','tools','settings','search',...TOOLS.map(a=>a.id)].includes(route))route='home';
  active=route;
  shell();
  const main=app.querySelector('#main-content');
  if(route==='home') renderHome(main);
  if(route==='tools') renderTools(main);
  if(route==='settings') renderSettings(main);
  if(route==='search') cleanup=await mountSearch({element:main,lang:settings.language,t,tools:TOOLS,openResult:go});
  if(route==='calculator') cleanup=mountCalculator({element:main,t,history,
    saveHistory:async list=>{history=list;await setMeta('calcHistory',list);},
    copyText,confirmAction:window.confirm,lang:settings.language});
  if(route==='clock') cleanup=mountWorldClock({element:main,t,lang:settings.language,
    timeZones:settings.timeZones,saveZones:timeZones=>updateSettings({timeZones})});
  if(route==='notes') cleanup=await mountNotes({element:main,t,lang:settings.language,
    confirmAction:window.confirm,notify:toast,initialId:selection?.id});
  if(route==='weather') cleanup=mountWeather({element:main,t,lang:settings.language,
    weatherCities:settings.weatherCities,weatherSelectedId:settings.weatherSelectedId,
    saveWeather:change=>updateSettings(change),notify:toast});
  if(route==='timer') cleanup=await mountTimer({element:main,t,lang:settings.language,notify:toast});
  if(route==='calendar') cleanup=await mountCalendar({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm,initialId:selection?.id});
  if(route==='tasks') cleanup=await mountTasks({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm,initialId:selection?.id});
  if(route==='quicklist') cleanup=await mountQuickList({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm,initialId:selection?.id});
  if(route==='football') cleanup=await mountFootball({element:main,t,lang:settings.language,notify:toast,confirmAction:window.confirm});
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
}
function tile(tool){
  return `<button class="tool-tile" type="button" data-open="${tool.id}"><span class="tool-icon ${tool.color}">${tool.icon}</span>
    <strong>${t(tool.title)}</strong><small>${t(tool.description)}</small><span class="tile-arrow" aria-hidden="true">↗</span></button>`;
}
function bindToolButtons(container){
  container.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.open)));
}
function renderHome(main){
  const favorites=settings.favourites.map(id=>TOOLS.find(tool=>tool.id===id)).filter(Boolean);
  main.innerHTML=`<section class="home-hero"><div class="eyebrow">PERSONAL TOOLS · ${VERSION}</div>
    <h1>${t('welcome')}</h1><p>${t('welcomeSub')}</p>
    <div class="today-widget"><span class="today-symbol">☼</span><div><small>${t('dateCard')}</small><strong id="home-date"></strong></div><strong class="today-time" id="home-time"></strong></div></section>
    <div id="today-summary-slot"></div>
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
  const stopToday=mountToday({element:main.querySelector('#today-summary-slot'),lang:settings.language,openTool:go});
  cleanup=()=>{clearInterval(minuteTimer);stopToday();};
  bindToolButtons(main);
  main.querySelector('#customise-home').addEventListener('click',()=>go('settings'));
  main.querySelector('#all-tools-link').addEventListener('click',()=>go('tools'));
  main.querySelector('#home-universal-search').addEventListener('click',()=>go('search'));
}
function renderTools(main){
  const recent=recentTools.map(id=>TOOLS.find(tool=>tool.id===id)).filter(Boolean);
  main.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / ${VERSION}</span><h1>${t('allTools')}</h1><p>${t('availableOffline')}</p></section><button type="button" class="hub-search-launch hub-tools-search" id="tools-universal-search"><span aria-hidden="true">⌕</span><span>${t('universalSearch')}</span><span aria-hidden="true">›</span></button>
    ${recent.length?`<section class="recent-tools"><h2>${t('recentTools')}</h2><div class="recent-tool-row">${recent.map(tool=>`<button type="button" class="recent-tool" data-open="${tool.id}"><span aria-hidden="true">${tool.icon}</span>${t(tool.title)}</button>`).join('')}</div></section>`:''}
    <div class="tiles-grid">${TOOLS.map(tile).join('')}</div>`;
  bindToolButtons(main);
  main.querySelector('#tools-universal-search').addEventListener('click',()=>go('search'));
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
function renderSettings(main){
  stopDiagnostics();
  const order=[...settings.favourites,...TOOLS.map(tool=>tool.id).filter(id=>!settings.favourites.includes(id))];
  main.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / ${VERSION}</span><h1>${t('settings')}</h1><p>${t('introSettings')}</p></section>
    <section class="surface setting-section"><h2>${t('theme')}</h2><div class="choice-row" role="group" aria-label="${t('theme')}">
      ${['light','dark','auto'].map(val=>`<button type="button" class="choice-btn ${settings.theme===val?'selected':''}" data-theme-choice="${val}" aria-pressed="${settings.theme===val}">${t(val)}</button>`).join('')}</div>
      <h2 class="setting-subhead">${t('language')}</h2><div class="choice-row" role="group" aria-label="${t('language')}">
      <button type="button" class="choice-btn ${settings.language==='bg'?'selected':''}" data-lang-choice="bg" aria-pressed="${settings.language==='bg'}">Български</button>
      <button type="button" class="choice-btn ${settings.language==='en'?'selected':''}" data-lang-choice="en" aria-pressed="${settings.language==='en'}">English</button></div></section>
    <section class="surface setting-section"><h2>${t('customise')}</h2><p class="muted">${t('customiseHint')}</p>
      <div class="settings-tools">${order.map(settingsToolRow).join('')}</div></section>
    <section class="surface setting-section"><h2>${t('recentTools')}</h2>
      <p class="muted">${recentReadOnly?t('recentCorrupt'):recentTools.map(id=>t(TOOLS.find(tool=>tool.id===id)?.title||'')).join(' · ')||t('none')}</p>
      <button type="button" class="secondary-btn" id="clear-recent">${t('clearRecent')}</button></section>
    <section class="surface setting-section"><h2>${t('dataBackup')}</h2><p class="muted">${t('backupHint')}</p>
      <div class="backup-actions"><button type="button" class="primary-btn" id="export-backup">↓ ${t('exportBackup')}</button>
      <button type="button" class="secondary-btn" id="import-backup">↑ ${t('importBackup')}</button>
      <input type="file" id="backup-file" accept=".json,application/json" hidden></div>
      <p class="warning-text">${t('importWarning')}</p>
      <button type="button" class="text-link" id="persistent-storage">${t('storagePersist')} ›</button></section>
    <section class="surface setting-section" id="health-section"></section>
    <section class="surface setting-section"><h2>${t('installation')}</h2><p class="muted">${t('installHint')}</p>
      <div class="row-between"><span>${t('appVersion')}</span><strong>v${VERSION}</strong></div>
      <p class="privacy-footer">🔒 ${t('privacy')}</p></section>`;
  stopDiagnostics=mountDiagnostics({element:main.querySelector('#health-section'),lang:settings.language});
  cleanup=()=>stopDiagnostics();
  main.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.addEventListener('click',async()=>{
    try{await updateSettings({theme:btn.dataset.themeChoice}); renderSettings(main);}catch(err){handleError(err);}
  }));
  main.querySelectorAll('[data-lang-choice]').forEach(btn=>btn.addEventListener('click',async()=>{
    try{await updateSettings({language:btn.dataset.langChoice});go('settings');}catch(err){handleError(err);}
  }));
  main.querySelectorAll('[data-favourite]').forEach(check=>check.addEventListener('change',async()=>{
    const id=check.dataset.favourite;
    const fav=settings.favourites.filter(x=>x!==id);
    if(check.checked)fav.push(id);
    try{await updateSettings({favourites:fav});renderSettings(main);}catch(err){handleError(err);}
  }));
  main.querySelectorAll('[data-reorder]').forEach(btn=>btn.addEventListener('click',async()=>{
    const [id,direction]=btn.dataset.reorder.split(':');
    const fav=[...settings.favourites];
    const index=fav.indexOf(id),target=index+(direction==='up'?-1:1);
    if(index<0||target<0||target>=fav.length)return;
    [fav[index],fav[target]]=[fav[target],fav[index]];
    try{await updateSettings({favourites:fav});renderSettings(main);}catch(err){handleError(err);}
  }));
  main.querySelector('#clear-recent').addEventListener('click',async()=>{
    try{await recentQueue.catch(()=>{});await setMeta('recentTools',[]);recentTools=[];recentReadOnly=false;toast(t('recentCleared'));renderSettings(main);}catch(err){handleError(err);}
  });
  main.querySelector('#export-backup').addEventListener('click',async()=>{
    try{
      const data=await createBackup();
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download=`MyHub-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      // Records that an export was initiated, NOT that Android saved the file.
      try{await setMeta('lastBackupExportAt',new Date().toISOString());}catch(err){console.warn('Backup date unavailable',err);}
    }catch(err){handleError(err);toast(t('exportFailed'));}
  });
  const fileInput=main.querySelector('#backup-file');
  main.querySelector('#import-backup').addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];
    fileInput.value='';
    if(!file)return;
    try{
      if(file.size>20_000_000)throw Error('File exceeds 20 MB');
      const data=JSON.parse(await file.text());
      validateBackup(data);
      if(!window.confirm(t('importConfirm')))return;
      await replaceFromBackup(data);
      toast(t('restored'));
      location.reload();
    }catch(err){console.error(err);toast(t('invalidBackup')+err.message);}
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
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate) location.reload();});
  navigator.serviceWorker.register('./sw.js').then(reg=>{
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
    if(requested==='bookmarks' && recordId && /^[A-Za-z0-9-]{1,100}$/.test(recordId)){
      window.history.replaceState(null,'',location.pathname);
      await navigate('bookmarks',{id:recordId});
    }else{
      await navigate('home');
    }
    registerWorker();
  }catch(err){
    console.error(err);
    app.innerHTML=`<main class="fatal-error"><h1>MyHub</h1><p>${t('storageError')}</p><p class="muted">${escapeHtml(err.message)}</p></main>`;
  }
}
void boot();
