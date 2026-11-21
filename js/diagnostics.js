/** Read-only local storage health. Storage estimate is origin-wide, not MyHub-only. */
import { getMeta, getNotes } from './db.js';
import { dataHealth, formatBytes } from './diagnostics-core.js';
import { escapeHtml } from './utils.js';
const words={
  bg:{header:'Състояние на данните',refresh:'Провери отново',checking:'Проверка…',notes:'Бележки',tasks:'Задачи',events:'Събития',links:'Връзки',storage:'Използвано място (за сайта)',quota:'Налично според браузъра',protected:'Защитено от автоматично изчистване',yes:'Да',no:'Не / не е потвърдено',unknown:'Неизвестно',last:'Последно подготвен JSON архив',none:'Няма записана дата',hint:'Тези стойности не са резервно копие. Мястото е общо за уеб адреса и може да включва други приложения. След изтегляне провери дали JSON файлът е в Downloads.',error:'Неуспешна проверка. Нищо не е изтрито.'},
  en:{header:'Local data health',refresh:'Check again',checking:'Checking…',notes:'Notes',tasks:'Tasks',events:'Events',links:'Bookmarks',storage:'Storage used (site-wide)',quota:'Browser-reported quota',protected:'Protected from automatic eviction',yes:'Yes',no:'No / not confirmed',unknown:'Unknown',last:'Last JSON export prepared',none:'No date recorded',hint:'These numbers are not a backup. Storage includes the whole web origin and may include other apps. Check that the downloaded JSON file exists in Downloads.',error:'Check failed. No data was deleted.'}
};
export function mountDiagnostics({element,lang='bg'}){
  const w=words[lang==='en'?'en':'bg'];let disposed=false;
  const refresh=async()=>{
    const status=element.querySelector('#health-status');if(!status||disposed)return;
    status.textContent=w.checking;
    try{
      const [notes,tasksData,calendarData,bookmarksData,lastBackupExportAt]=await Promise.all([
        getNotes(),getMeta('tasksData'),getMeta('calendarData'),getMeta('bookmarksData'),getMeta('lastBackupExportAt')
      ]);
      const stats=dataHealth({notes,tasksData,calendarData,bookmarksData});
      const estimate=navigator.storage?.estimate?await navigator.storage.estimate().catch(()=>null):null;
      const persistent=navigator.storage?.persisted?await navigator.storage.persisted().catch(()=>null):null;
      const last=typeof lastBackupExportAt==='string'&&!Number.isNaN(Date.parse(lastBackupExportAt))
        ?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(lastBackupExportAt)):w.none;
      if(disposed)return;
      status.innerHTML=`<div class="hub-health-stats"><span>${w.notes}: <strong>${stats.notes}</strong></span><span>${w.tasks}: <strong>${stats.tasks}</strong></span><span>${w.events}: <strong>${stats.events}</strong></span><span>${w.links}: <strong>${stats.bookmarks}</strong></span></div>
        <p>${w.storage}: <strong>${estimate?formatBytes(estimate.usage,lang):w.unknown}</strong></p>
        <p>${w.quota}: <strong>${estimate?formatBytes(estimate.quota,lang):w.unknown}</strong></p>
        <p>${w.protected}: <strong>${persistent===true?w.yes:persistent===false?w.no:w.unknown}</strong></p>
        <p>${w.last}: <strong>${escapeHtml(last)}</strong></p><p class="muted">${w.hint}</p>`;
    }catch(err){console.warn('Diagnostics unavailable',err);if(!disposed)status.textContent=w.error;}
  };
  const click=e=>{if(e.target.closest('#refresh-health'))void refresh();};
  element.innerHTML=`<h2>${w.header}</h2><div id="health-status" role="status" aria-live="polite">${w.checking}</div><button id="refresh-health" type="button" class="text-link">${w.refresh} ↻</button>`;
  element.addEventListener('click',click);
  void refresh();
  return ()=>{disposed=true;element.removeEventListener('click',click);};
}
