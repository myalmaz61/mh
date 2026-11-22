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
import { mountPwaHealth } from './pwa-health.js';
import { previewBackup, compareBackupContents, backupReminderState } from './backup-preview-core.js';
import { mountSearch } from './search.js';
import { mountQuickAdd } from './quick-add.js';
import { mountTextCounter } from './text-counter.js';
import { mountRandomGenerator } from './random-generator.js';
import { advanceRecentTools, validRecentTools } from './recent-core.js';
import { visibleTools, toggleToolHidden } from './visibility-core.js';
import { orderedTools, moveToolOrder, DEFAULT_TOOL_ORDER } from './tool-order-core.js';

const app=document.querySelector('#app');
let settings={...DEFAULT_SETTINGS};
let history=[];
let active='home';
let cleanup=()=>{};
let stopDiagnostics=()=>{};
let stopPwaHealth=()=>{};
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
  if(route==='search') cleanup=await mountSearch({element:main,lang:settings.language,t,tools:visibleTools(TOOLS,settings.hiddenTools),openResult:go});
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
  const favorites=settings.favourites.map(id=>TOOLS.find(tool=>tool.id===id)).filter(tool=>tool&&!settings.hiddenTools.includes(tool.id));
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
function renderSettings(main,openHidden=false,openOrder=false){
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
    <section class="surface setting-section"><h2>${t('customise')}</h2><p class="muted">${t('customiseHint')}</p>
      <div class="settings-tools">${order.map(settingsToolRow).join('')}</div></section>
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
    <section class="surface setting-section"><h2>${t('recentTools')}</h2>
      <p class="muted">${recentReadOnly?t('recentCorrupt'):recentTools.map(id=>t(TOOLS.find(tool=>tool.id===id)?.title||'')).join(' · ')||t('none')}</p>
      <button type="button" class="secondary-btn" id="clear-recent">${t('clearRecent')}</button></section>
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
    <section class="surface setting-section" id="health-section"></section>
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
      try{await setMeta('lastBackupExportAt',new Date().toISOString());await refreshReminder();}catch(err){console.warn('Backup date unavailable',err);}
    }catch(err){handleError(err);toast(t('exportFailed'));}
  });
  const fileInput=main.querySelector('#backup-file');
  const previewElement=main.querySelector('#backup-preview');
  const previewWords=settings.language==='en'
    ?{heading:'Checked archive — compare before replacing',date:'Created',version:'Archive version',legacy:'Older archive: absent sections will be restored to defaults (often empty).',counts:['Notes','Tasks','Events','Quick lists','Bookmarks','RSS articles','Football leagues'],confirm:'Replace local data',cancel:'Cancel',ready:'No local data has been changed.',working:'Restoring…',current:'Now',incoming:'After Restore',removed:'Missing from archive',changed:'Different existing records',comparisonFail:'Unable to compare existing data. Restore would still replace everything; take care.',safe:'Nothing missing among the seven compared record types. Settings and other content will still be replaced.',risk:'Some local records are missing from this archive.',ack:'I understand Restore REPLACES all local data and cannot be undone without a separate backup.',notAcknowledged:'Tick the confirmation box before restoring.'}
    :{heading:'Проверен архив — сравнение преди заместване',date:'Създаден',version:'Версия на архива',legacy:'Стар архив: липсващите раздели ще получат началните си стойности (често празни).',counts:['Бележки','Задачи','Събития','Бързи списъци','Връзки','RSS статии','Футболни първенства'],confirm:'Замени локалните данни',cancel:'Отказ',ready:'Все още нищо не е променено.',working:'Възстановяване…',current:'Сега',incoming:'След Restore',removed:'Липсват в архива',changed:'Различни съществуващи записи',comparisonFail:'Не мога да сравня текущите данни. Restore въпреки това ще ги замени изцяло — бъди внимателен.',safe:'В седемте проверявани вида записи няма липсващи ID. Настройките и съдържанието пак ще бъдат заменени.',risk:'В този архив липсват някои текущи записи.',ack:'Разбирам, че Restore ЗАМЕНЯ всички локални данни и не може да бъде отменен без отделен архив.',notAcknowledged:'Маркирай полето за потвърждение преди Restore.'};
  function cancelPreview(){pendingBackup=null;previewElement.replaceChildren();previewElement.hidden=true;}
  let pendingBackup=null;
  main.querySelector('#import-backup').addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];fileInput.value='';cancelPreview();
    if(!file)return;
    try{
      if(file.size>20_000_000)throw Error('File exceeds 20 MB');
      const data=JSON.parse(await file.text());
      const cleaned=validateBackup(data);
      const summary=previewBackup(data,cleaned);
      // Comparing cannot modify local content. If local data is corrupt, allow
      // selecting a known-good archive but display an explicit warning.
      let comparison=null;
      try{
        const current=validateBackup(await createBackup());
        comparison=compareBackupContents(current,cleaned);
      }catch(err){console.warn('Current data comparison not available',err);}
      pendingBackup=data;
      const created=summary.createdAt?new Intl.DateTimeFormat(languageCode(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(summary.createdAt)):'—';
      const lost=comparison?.some(item=>item.removed>0);
      const changed=comparison?.some(item=>item.changed>0);
      previewElement.innerHTML=`<h3>${previewWords.heading}</h3><p>${previewWords.date}: <strong>${escapeHtml(created)}</strong> · ${previewWords.version}: <strong>${escapeHtml(summary.version||'—')}</strong></p>
        ${comparison?`<div class="backup-compare-list">${comparison.map((entry,i)=>`<div class="backup-compare-row"><strong>${previewWords.counts[i]}</strong><span>${previewWords.current}: ${entry.current} → ${previewWords.incoming}: ${entry.incoming}</span>${entry.removed||entry.changed?`<small class="warning-text">${entry.removed?`${previewWords.removed}: ${entry.removed}`:''}${entry.removed&&entry.changed?' · ':''}${entry.changed?`${previewWords.changed}: ${entry.changed}`:''}</small>`:''}</div>`).join('')}</div>`:''}
        <p class="${!comparison||lost||changed?'warning-text':'muted'}">${!comparison?previewWords.comparisonFail:lost?previewWords.risk:previewWords.safe}</p>
        ${summary.missing.length?`<p class="warning-text">${previewWords.legacy}</p>`:''}
        <p class="muted">${previewWords.ready}</p>
        <label class="backup-acknowledge"><input type="checkbox" id="backup-ack-check"><span>${previewWords.ack}</span></label>
        <div class="backup-actions"><button type="button" class="danger-btn" id="confirm-backup-restore" disabled>${previewWords.confirm}</button><button type="button" class="secondary-btn" id="cancel-backup-restore">${previewWords.cancel}</button></div>`;
      previewElement.hidden=false;
      const confirmButton=previewElement.querySelector('#confirm-backup-restore');
      previewElement.querySelector('#backup-ack-check').addEventListener('change',e=>{confirmButton.disabled=!e.target.checked;});
      previewElement.querySelector('#cancel-backup-restore').addEventListener('click',cancelPreview);
      confirmButton.addEventListener('click',async()=>{
        if(!pendingBackup || !previewElement.querySelector('#backup-ack-check').checked){toast(previewWords.notAcknowledged);return;}
        if(!window.confirm(t('importConfirm')))return;
        confirmButton.disabled=true;confirmButton.textContent=previewWords.working;
        try{
          // Validate again before the atomic IndexedDB transaction.
          await replaceFromBackup(pendingBackup);
          pendingBackup=null;
          toast(t('restored'));location.reload();
        }catch(err){console.error(err);confirmButton.disabled=false;confirmButton.textContent=previewWords.confirm;toast(t('importFailed'));}
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
    if(applyingUpdate){location.reload();return;}
    waitingWorker=null;updateIndicators();
  });
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
