/** v6.7 — read-only data integrity, emergency draft and selected-file backup checks. */
import { getMeta, createBackup } from './db.js';
import { inspectBackupText, MAX_DIAGNOSTIC_FILE_BYTES } from './backup-diagnostics-core.js';
import { createNotesDraftStore } from './notes-draft-core.js';
import { createFormRecoveryStore } from './form-recovery-core.js';
import { createQuickRecoveryStore } from './quick-list-recovery-core.js';
import { allRecoveryDraftInventory } from './backup-guard-core.js';
import { dataHealth, formatBytes } from './diagnostics-core.js';
import { escapeHtml } from './utils.js';

const words={
  bg:{header:'Състояние на данните',refresh:'Провери отново',checking:'Проверка…',notes:'Бележки',tasks:'Задачи',events:'Събития',links:'Връзки',storage:'Използвано място (за сайта)',quota:'Налично според браузъра',protected:'Защитено от автоматично изчистване',yes:'Да',no:'Не / не е потвърдено',unknown:'Неизвестно',integrity:'Проверка на локалните данни',good:'Всички раздели са валидни',last:'Последно подготвен JSON архив',none:'Няма записана дата',hint:'Датата означава само подготвено изтегляне, не доказва, че файлът е в Downloads. Използваното място е за целия уеб адрес.',error:'Неуспешна проверка на локалните данни. Нищо не е изтрито.',drafts:'Аварийни чернови (извън JSON архива)',quick:'Бързи списъци',damaged:'Повредени чернови',unavailable:'Някои чернови не могат да се проверят — не изчиствай данните на сайта.',draftsHint:'Преди Restore запази или възстанови незавършените редакции. Проверка на чернови не променя съдържанието им.',checkFile:'Провери JSON файл от Downloads',checkFileHint:'Проверява избран файл без Restore или записване в MyHub. SHA-256 потвърждава целостта, не авторството на архива.',fileReady:'Избери JSON файл за проверка.',fileChecking:'Проверявам избрания файл…',fileValid:'Проверен JSON архив — SHA-256 съвпада.',fileLegacy:'Стар, структурно валиден архив без SHA-256. Целостта не е доказана.',fileInvalid:'Избраният файл не е валиден, е прекалено голям или контролният отпечатък не съвпада. Локалните данни не са променени.',fileDate:'Дата',fileVersion:'Версия',fileNotes:'Бележки'},
  en:{header:'Local data health',refresh:'Check again',checking:'Checking…',notes:'Notes',tasks:'Tasks',events:'Events',links:'Bookmarks',storage:'Storage used (site-wide)',quota:'Browser-reported quota',protected:'Protected from automatic eviction',yes:'Yes',no:'No / not confirmed',unknown:'Unknown',integrity:'Local data integrity',good:'All sections are valid',last:'Last JSON export prepared',none:'No date recorded',hint:'The date means an export was prepared, not proof of a file saved in Downloads. Storage covers the whole web origin.',error:'Local data check failed. Nothing was deleted.',drafts:'Emergency drafts (outside JSON backups)',quick:'Quick Lists',damaged:'Damaged drafts',unavailable:'Some drafts cannot be checked — do not clear site data.',draftsHint:'Before Restore, save or recover unfinished edits. Checking drafts never modifies them.',checkFile:'Check a JSON file from Downloads',checkFileHint:'Checks the selected file without restoring or saving anything in MyHub. SHA-256 verifies integrity, not who created the backup.',fileReady:'Choose a JSON backup to check.',fileChecking:'Checking selected file…',fileValid:'Valid JSON backup — SHA-256 matches.',fileLegacy:'Structurally valid legacy backup without SHA-256. File integrity is unverified.',fileInvalid:'The selected file is invalid, too large, or its checksum does not match. No local data was changed.',fileDate:'Date',fileVersion:'Version',fileNotes:'Notes'}
};
export function mountDiagnostics({element,lang='bg'}){
  const w=words[lang==='en'?'en':'bg'];let disposed=false,checkEpoch=0;
  const fileStatus=()=>element.querySelector('#health-file-status');
  const refresh=async()=>{
    const status=element.querySelector('#health-status');if(!status||disposed)return;
    status.textContent=w.checking;
    try{
      // Read-only full archive validation; no download and no local writes.
      const [snapshot,lastBackupExportAt]=await Promise.all([createBackup(),getMeta('lastBackupExportAt')]);
      const {notes,tasksData,calendarData,bookmarksData}=snapshot.data;
      const stats=dataHealth({notes,tasksData,calendarData,bookmarksData});
      let local=null;
      try{local=window.localStorage;}catch{ /* Browser may block storage. */ }
      const recovery=allRecoveryDraftInventory({
        notesStore:createNotesDraftStore(local),
        formStore:createFormRecoveryStore(local),
        quickStore:createQuickRecoveryStore(local)
      });
      const estimate=navigator.storage?.estimate?await navigator.storage.estimate().catch(()=>null):null;
      const persistent=navigator.storage?.persisted?await navigator.storage.persisted().catch(()=>null):null;
      const last=typeof lastBackupExportAt==='string'&&!Number.isNaN(Date.parse(lastBackupExportAt))
        ?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(lastBackupExportAt)):w.none;
      if(disposed)return;
      const groups=[[w.notes,recovery.byKind.notes],[w.tasks,recovery.byKind.tasks],[w.events,recovery.byKind.calendar],[w.quick,recovery.byKind.quickLists]];
      status.innerHTML=`<p>${w.integrity}: <strong>${w.good}</strong></p><div class="hub-health-stats"><span>${w.notes}: <strong>${stats.notes}</strong></span><span>${w.tasks}: <strong>${stats.tasks}</strong></span><span>${w.events}: <strong>${stats.events}</strong></span><span>${w.links}: <strong>${stats.bookmarks}</strong></span></div>
        <p>${w.storage}: <strong>${estimate?formatBytes(estimate.usage,lang):w.unknown}</strong></p>
        <p>${w.quota}: <strong>${estimate?formatBytes(estimate.quota,lang):w.unknown}</strong></p>
        <p>${w.protected}: <strong>${persistent===true?w.yes:persistent===false?w.no:w.unknown}</strong></p>
        <p>${w.last}: <strong>${escapeHtml(last)}</strong></p>
        <p><strong>${w.drafts}</strong></p><div class="hub-health-stats">${groups.map(([name,data])=>`<span>${name}: <strong>${data.unavailable?w.unknown:data.count}</strong></span>`).join('')}</div>
        ${recovery.corrupt?`<p class="warning-text">${w.damaged}: <strong>${recovery.corrupt}</strong></p>`:''}
        ${recovery.unavailable?`<p class="warning-text">${w.unavailable}</p>`:''}
        <p class="muted">${w.draftsHint}</p><p class="muted">${w.hint}</p>`;
    }catch(err){console.warn('Diagnostics unavailable',err);if(!disposed)status.textContent=w.error;}
  };
  const click=e=>{if(e.target.closest('#refresh-health'))void refresh();};
  const changed=async e=>{
    if(e.target?.id!=='health-file')return;
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    const epoch=++checkEpoch;
    const output=fileStatus();if(!output)return;output.textContent=w.fileChecking;
    try{
      if(!Number.isFinite(file.size)||file.size>MAX_DIAGNOSTIC_FILE_BYTES)throw Error('Invalid size');
      const info=await inspectBackupText(await file.text(),file.size);
      if(disposed||epoch!==checkEpoch)return;
      const date=info.date&&Number.isFinite(Date.parse(info.date))
        ?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(info.date)):'—';
      const title=info.status==='verified'?w.fileValid:w.fileLegacy;
      output.innerHTML=`<strong>${title}</strong><p>${w.fileDate}: ${escapeHtml(date)} · ${w.fileVersion}: ${escapeHtml(info.version||'—')} · ${w.fileNotes}: ${info.notes}</p>`;
    }catch(err){console.warn('Selected backup file failed validation',err);if(!disposed&&epoch===checkEpoch)output.textContent=w.fileInvalid;}
  };
  element.innerHTML=`<h2>${w.header}</h2><div id="health-status" role="status" aria-live="polite">${w.checking}</div><button id="refresh-health" type="button" class="text-link">${w.refresh} ↻</button>
    <div class="settings-diagnostics-body"><label class="secondary-btn" for="health-file">${w.checkFile}</label><input id="health-file" type="file" accept=".json,application/json" hidden><p class="muted">${w.checkFileHint}</p><div id="health-file-status" role="status" aria-live="polite">${w.fileReady}</div></div>`;
  element.addEventListener('click',click);
  element.addEventListener('change',changed);
  void refresh();
  return ()=>{disposed=true;checkEpoch++;element.removeEventListener('click',click);element.removeEventListener('change',changed);};
}
