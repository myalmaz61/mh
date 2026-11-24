/** Read-only PWA health, plus an explicit user-triggered update check. */
import { VERSION } from './config.js';
import { pwaAssessment, PWA_CRITICAL_FILES, pwaCriticalCoverage, readShellStatus, shellVersionState } from './pwa-health-core.js';
const words={
  bg:{header:'PWA и обновления',run:'Провери за обновление',refresh:'Провери състоянието',loading:'Проверка…',unsupported:'Service Worker / Cache Storage не се поддържат.',controlling:'Приложението се управлява от Service Worker',shell:'Основните файлове са в офлайн кеша',waiting:'Нова версия очаква активиране',yes:'Да',no:'Не',online:'Връзка според браузъра',onlineYes:'Онлайн',onlineNo:'Офлайн',hint:'Това е проверка на основните ресурси, не доказателство, че всички външни услуги работят офлайн. Обновленията не изтриват IndexedDB.',requested:'Проверката е заявена. Ако има нова версия, ще се появи бутон за обновяване.',noReg:'PWA още не е регистрирана. Провери отворения адрес и презареди.',failed:'Неуспешна проверка. Съществуващите данни не са променени.',scope:'Обхват',installed:'Версия на страницата',controllerVersion:'Активен Service Worker',match:'Съвпадение на версиите',unverified:'Не може да се потвърди (стара версия или блокиран отговор)',different:'Различни версии — презареди след запазване',noController:'Още няма управляващ Service Worker',matched:'Съвпадат'},
  en:{header:'PWA & updates',run:'Check for updates',refresh:'Refresh status',loading:'Checking…',unsupported:'Service Worker / Cache Storage unavailable.',controlling:'Controlled by a Service Worker',shell:'Core files cached for offline use',waiting:'New version waiting for activation',yes:'Yes',no:'No',online:'Browser-reported connectivity',onlineYes:'Online',onlineNo:'Offline',hint:'This checks the core shell, not whether external services work offline. Updates do not delete IndexedDB.',requested:'Update check requested. A button will appear if a new version is ready.',noReg:'PWA is not registered yet. Check the page address and reload.',failed:'Check failed. Existing data was not changed.',scope:'Scope',installed:'Page code version',controllerVersion:'Active Service Worker',match:'Version consistency',unverified:'Cannot verify (old worker or blocked reply)',different:'Different versions — save work before reloading',noController:'No controlling Service Worker yet',matched:'Versions match'}
};
export function mountPwaHealth({element,lang='bg',onWaiting=()=>{}}){
  const w=words[lang==='en'?'en':'bg'];let disposed=false;
  element.innerHTML=`<h2>${w.header}</h2><div class="hub-pwa-state" role="status" aria-live="polite"></div><div class="backup-actions"><button type="button" class="secondary-btn" data-pwa-refresh>${w.refresh}</button><button type="button" class="secondary-btn" data-pwa-update>${w.run}</button></div><p class="muted">${w.hint}</p>`;
  const output=element.querySelector('.hub-pwa-state');
  const yesNo=v=>v?w.yes:w.no;
  let inspectionToken=0;
  // Bounded, read-only status query. Older workers do not support it:
  // report Unknown rather than assuming that the page and worker match.
  function controllerStatus(controller){
    if(!controller || typeof MessageChannel!=='function')return Promise.resolve(null);
    return new Promise(resolve=>{
      const channel=new MessageChannel();
      let settled=false;
      const finish=value=>{
        if(settled)return;settled=true;
        clearTimeout(timer);
        channel.port1.close();channel.port2.close();
        resolve(readShellStatus(value));
      };
      const timer=setTimeout(()=>finish(null),1500);
      channel.port1.onmessage=event=>finish(event.data);
      try{controller.postMessage({type:'SHELL_STATUS'},[channel.port2]);}
      catch{finish(null);}
    });
  }
  async function inspect(){
    if(disposed)return null;
    const token=++inspectionToken;
    output.textContent=w.loading;
    const supported='serviceWorker' in navigator && 'caches' in window;
    if(!supported){if(!disposed&&token===inspectionToken)output.textContent=w.unsupported;return null;}
    const reg=await navigator.serviceWorker.getRegistration(new URL('../',import.meta.url));
    const controller=navigator.serviceWorker.controller;
    const report=await controllerStatus(controller);
    const versionState=shellVersionState(VERSION,report,!!controller);
    const names=await caches.keys();
    // Inspect the controlling worker's shell when known, not an unrelated
    // cache from an installed-but-not-yet-active new worker.
    const cacheName=report?.cacheName||`myhub-shell-v${VERSION}`;
    let coverage=pwaCriticalCoverage([]);
    if(names.includes(cacheName)){
      const cache=await caches.open(cacheName);
      const root=new URL('../',import.meta.url);
      const matches=await Promise.all(PWA_CRITICAL_FILES.map(name=>cache.match(new URL(name,root))));
      coverage=pwaCriticalCoverage(matches);
    }
    const state=pwaAssessment({supported,controlled:!!controller,waiting:!!reg?.waiting,
      shellCached:coverage.ready,versionMatches:versionState==='matched',onlineReported:navigator.onLine});
    if(disposed||token!==inspectionToken)return reg;
    output.replaceChildren();
    const consistency=versionState==='matched'?w.matched:versionState==='different'?w.different:versionState==='unknown'?w.unverified:w.noController;
    // Text only. No version or URL string is inserted into HTML.
    for(const [label,value] of [[w.installed,`v${VERSION}`],
      [w.controllerVersion,report?`v${report.version}`:w.unverified],
      [w.match,consistency],
      [w.controlling,yesNo(state.controlled)],
      [w.shell,`${coverage.cached}/${coverage.total} · ${yesNo(state.shellCached)}`],
      [w.waiting,yesNo(state.waiting)],
      [w.online,state.onlineReported?w.onlineYes:w.onlineNo],[w.scope,reg?.scope||'—']]){
      const row=document.createElement('p');row.className='pwa-health-row';
      const left=document.createElement('span');left.textContent=label;
      const right=document.createElement('strong');right.textContent=value;
      row.append(left,right);output.append(row);
    }
    if(state.waiting)onWaiting(reg.waiting);
    return reg;
  }
  async function refresh(){try{await inspect();}catch(err){console.warn('PWA diagnostics failed',err);if(!disposed)output.textContent=w.failed;}}
  async function update(){
    const btn=element.querySelector('[data-pwa-update]');
    btn.disabled=true;
    try{
      if(!('serviceWorker' in navigator))throw Error('Unsupported');
      const reg=await navigator.serviceWorker.getRegistration(new URL('../',import.meta.url));
      if(!reg){if(!disposed)output.textContent=w.noReg;return;}
      await reg.update();
      if(disposed)return;
      await inspect();
      const p=document.createElement('p');p.className='muted';p.textContent=w.requested;output.append(p);
    }catch(err){console.warn('PWA update check failed',err);if(!disposed)output.textContent=w.failed;}
    finally{if(!disposed)btn.disabled=false;}
  }
  const click=e=>{
    if(e.target.closest('[data-pwa-refresh]'))void refresh();
    if(e.target.closest('[data-pwa-update]'))void update();
  };
  element.addEventListener('click',click);void refresh();
  return ()=>{disposed=true;inspectionToken++;element.removeEventListener('click',click);};
}
