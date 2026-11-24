/** Read-only PWA health, plus an explicit user-triggered update check. */
import { VERSION } from './config.js';
import { pwaAssessment, PWA_CRITICAL_FILES, pwaCriticalCoverage } from './pwa-health-core.js';
const words={
  bg:{header:'PWA и обновления',run:'Провери за обновление',refresh:'Провери състоянието',loading:'Проверка…',unsupported:'Service Worker / Cache Storage не се поддържат.',controlling:'Приложението се управлява от Service Worker',shell:'Основните файлове са в офлайн кеша',waiting:'Нова версия очаква активиране',yes:'Да',no:'Не',online:'Връзка според браузъра',onlineYes:'Онлайн',onlineNo:'Офлайн',hint:'Това е проверка на основните ресурси, не доказателство, че всички външни услуги работят офлайн. Обновленията не изтриват IndexedDB.',requested:'Проверката е заявена. Ако има нова версия, ще се появи бутон за обновяване.',noReg:'PWA още не е регистрирана. Провери отворения адрес и презареди.',failed:'Неуспешна проверка. Съществуващите данни не са променени.',scope:'Обхват',installed:'Инсталирана версия на кода'},
  en:{header:'PWA & updates',run:'Check for updates',refresh:'Refresh status',loading:'Checking…',unsupported:'Service Worker / Cache Storage unavailable.',controlling:'Controlled by a Service Worker',shell:'Core files cached for offline use',waiting:'New version waiting for activation',yes:'Yes',no:'No',online:'Browser-reported connectivity',onlineYes:'Online',onlineNo:'Offline',hint:'This checks the core shell, not whether external services work offline. Updates do not delete IndexedDB.',requested:'Update check requested. A button will appear if a new version is ready.',noReg:'PWA is not registered yet. Check the page address and reload.',failed:'Check failed. Existing data was not changed.',scope:'Scope',installed:'Code version'}
};
export function mountPwaHealth({element,lang='bg',onWaiting=()=>{}}){
  const w=words[lang==='en'?'en':'bg'];let disposed=false;
  element.innerHTML=`<h2>${w.header}</h2><div class="hub-pwa-state" role="status" aria-live="polite"></div><div class="backup-actions"><button type="button" class="secondary-btn" data-pwa-refresh>${w.refresh}</button><button type="button" class="secondary-btn" data-pwa-update>${w.run}</button></div><p class="muted">${w.hint}</p>`;
  const output=element.querySelector('.hub-pwa-state');
  const yesNo=v=>v?w.yes:w.no;
  async function inspect(){
    if(disposed)return null;
    output.textContent=w.loading;
    const supported='serviceWorker' in navigator && 'caches' in window;
    if(!supported){output.textContent=w.unsupported;return null;}
    const reg=await navigator.serviceWorker.getRegistration(new URL('../',import.meta.url));
    const names=await caches.keys();
    const cacheName=`myhub-shell-v${VERSION}`;
    let coverage=pwaCriticalCoverage([]);
    if(names.includes(cacheName)){
      const cache=await caches.open(cacheName);
      const root=new URL('../',import.meta.url);
      const matches=await Promise.all(PWA_CRITICAL_FILES.map(name=>cache.match(new URL(name,root))));
      coverage=pwaCriticalCoverage(matches);
    }
    const shellCached=coverage.ready;
    const state=pwaAssessment({supported,controlled:!!navigator.serviceWorker.controller,waiting:!!reg?.waiting,shellCached,onlineReported:navigator.onLine});
    if(disposed)return reg;
    // Text-only rendering: never inject third-party strings into HTML.
    output.replaceChildren();
    for(const [label,value] of [[w.installed,`v${VERSION}`],[w.controlling,yesNo(state.controlled)],[w.shell,`${coverage.cached}/${coverage.total} · ${yesNo(state.shellCached)}`],[w.waiting,yesNo(state.waiting)],[w.online,state.onlineReported?w.onlineYes:w.onlineNo],[w.scope,reg?.scope||'—']]){
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
  return ()=>{disposed=true;element.removeEventListener('click',click);};
}
