import { getNotes, getMeta, setMetaIfUnchanged, putNote, putNoteIfUnchanged, toggleNoteQuickFlag, restoreDeletedNote, moveNoteToTrash, getNotesTrash, restoreTrashedNote, purgeTrashedNote, emptyNotesTrashForever, changeNotesCategories } from './db.js';
import { escapeHtml, makeNote, uid, safeClone } from './utils.js';
import { MAX_NOTES } from './config.js';
import { draftTaskFromNote } from './cross-actions-core.js';
import { plainNoteText, duplicateNoteData } from './note-actions-core.js';
import { createNotesSelector, recentNotes } from './notes-view-core.js';
import { matchingQuickAction } from './interaction-stability-core.js';
import { NOTES_PAGE_SIZE, sliceNotesPage, nextNotesPageLimit } from './notes-list-core.js';
import { categoryName, noteCategories } from './notes-category-core.js';
import { MAX_BULK_NOTES } from './notes-bulk-core.js';
import { parseChecklistBatch, setChecklistCompletion, checklistProgress, moveChecklistRow } from './notes-checklist-core.js';
import { createNoteSaveManager } from './notes-save-core.js';
import { hasPendingChecklistInput, noteEditorSaveUi, isNoteSaveShortcut } from './notes-editor-safety-core.js';
import { createNotesDraftStore, notesMatch } from './notes-draft-core.js';
import { emptyNotesTemplates, validNotesTemplates, MAX_NOTE_TEMPLATES, templateFromNote, noteFromTemplate, templateAdd, templateRename, templateRemove } from './notes-templates-core.js';

export async function mountNotes({ element, t, lang, confirmAction, notify, initialId=null, viewState=null, onQuickDraft=()=>{} }) {
  const stored = await getNotes();
  const valid = note => note && typeof note.id === 'string' && ['text','checklist'].includes(note.kind) &&
    typeof note.title === 'string' && typeof note.body === 'string' && Array.isArray(note.items) &&
    note.items.every(item => item && typeof item.text === 'string' && typeof item.done === 'boolean') &&
    typeof note.updatedAt === 'string' && Number.isFinite(Date.parse(note.updatedAt)) &&
    (note.category===undefined || (typeof note.category==='string' && note.category.length<=40 && !/[\u0000-\u001f\u007f]/.test(note.category)));
  let notes = stored.filter(valid);
  let templates;
  let templatesReadOnly=false;
  let templatesBaseline;
  try {
    const raw=await getMeta('notesTemplatesData');
    if(raw!==undefined && !validNotesTemplates(raw))throw Error('Invalid templates');
    templatesBaseline=raw;templates=raw===undefined?emptyNotesTemplates():raw;
  }catch{templates=emptyNotesTemplates();templatesReadOnly=true;notify(t('notesTemplateCorrupt'));}
  const updateTemplates=async next=>{
    if(templatesReadOnly)throw Error('Templates in read-only safety mode');
    await setMetaIfUnchanged('notesTemplatesData',templatesBaseline,next);
    templatesBaseline=next;templates=next;
  };

  let trash;
  try { trash = await getNotesTrash(); } catch { trash = null; notify(t('trashCorrupt')); }
  if(notes.length !== stored.length) notify(t('corruptRecords'));
  let currentId = null;
  let currentSaveNow=null;
  let search = viewState?.search ?? '';
  let scope = viewState?.scope ?? 'all';
  let order = viewState?.order ?? 'newest';
  let displayedLimit = Math.max(NOTES_PAGE_SIZE,viewState?.limit ?? NOTES_PAGE_SIZE);
  // Only transient UI state. Never part of note data, IndexedDB or JSON Backup.
  let templatePanelOpen = viewState?.templatePanelOpen === true;
  let templateQuery = typeof viewState?.templateQuery === 'string' ? viewState.templateQuery.slice(0,100) : '';
  const rememberTemplatePanel = () => {
    const panel=element.querySelector('#notes-templates-panel');
    if(!panel)return; // The note editor and Trash have no template panel.
    templatePanelOpen=panel.open;
    templateQuery=(element.querySelector('#notes-template-search')?.value||'').slice(0,100);
  };
  let categoryFilter = viewState?.category ?? '*';
  let bulkMode = false;
  let quickActionBusy = false;
  const selectedIds = new Set();
  let timer = null;
  let dirty = false;
  let lastDeleted = null; // quick Undo stays temporary; the Trash itself persists
  let disposed = false;
  // Each editor has its own synchronous recovery snapshot, outside IndexedDB.
  let localDraftStorage=null;
  try { localDraftStorage=window.localStorage; } catch { /* storage blocked */ }
  const draftStore=createNotesDraftStore(localDraftStorage);
  let editorDraftKey=null;
  let recoveryOrigin=null; // Cleared only after a successful guarded commit.
  let draftWarningShown=false;
  const locale = lang === 'en' ? 'en-GB' : 'bg-BG';
  const current = () => notes.find(n=>n.id===currentId);
  const hasUnaddedChecklistInput = () => currentId && current()?.kind==='checklist' &&
    hasPendingChecklistInput(element.querySelector('#new-item')?.value, element.querySelector('#checklist-paste')?.value);
  const updateSaveStatus = state => {
    dirty=state.dirty;
    if(disposed || !currentId)return;
    const status=element.querySelector('#note-status');
    const recovery=element.querySelector('#notes-save-recovery');
    const ui=noteEditorSaveUi(state,hasUnaddedChecklistInput());
    const saveNowButton=element.querySelector('#notes-save-now');
    if(saveNowButton){saveNowButton.hidden=!ui.showSave;saveNowButton.disabled=ui.disableSave;}
    if(status){
      status.textContent=ui.status==='error'?t('notesSaveFailed'):
        ui.status==='pending'?t('notesChecklistUnaddedStatus'):
        ui.status==='saving'?t('saving'):t('saved');
      status.classList.toggle('save-status-error',Boolean(state.error));
    }
    if(recovery){
      recovery.hidden=!state.error;
      const message=recovery.querySelector('#notes-save-message');
      if(message)message.textContent=t(state.error?.code==='stale-note'?'notesSaveConflict':state.quota?'notesStorageFull':'notesSaveHelp');
    }
  };
  // For the currently open editor only: the last committed snapshot, never
  // the live mutable draft. This prevents a long-backgrounded Android tab from
  // silently overwriting another tab's newer changes on return.
  let expectedSavedNote=null;
  const saveManager=createNoteSaveManager({
    write:async snapshot=>{
      if(!expectedSavedNote || expectedSavedNote.id!==snapshot.id)throw Error('Invalid editor baseline');
      const writingKey=editorDraftKey;
      const writingOrigin=recoveryOrigin;
      await putNoteIfUnchanged(snapshot,expectedSavedNote);
      expectedSavedNote=safeClone(snapshot); // Advance ONLY after committed transaction.
      draftStore.clearIfCommitted(writingKey,snapshot);
      if(writingOrigin){
        draftStore.removeIfUnchanged(writingOrigin.key,writingOrigin.raw);
        if(recoveryOrigin===writingOrigin)recoveryOrigin=null;
      }
    },onChange:updateSaveStatus
  });
  const flush = async () => {
    if(timer){clearTimeout(timer);timer=null;}
    const ok=await saveManager.saveNow();
    updateSaveStatus(saveManager.state());
    if(!ok)notify(t('notesSaveFailed'));
    return ok;
  };
  const schedule = () => {
    const snapshot=safeClone(current());
    // Write synchronously before debounce/async IndexedDB. A sudden Android
    // process kill then leaves a recoverable copy whenever storage allows it.
    const result=draftStore.write(editorDraftKey,expectedSavedNote,snapshot);
    if(!result.ok && !draftWarningShown){
      draftWarningShown=true;
      notify(t(result.reason==='too-large'?'notesDraftTooLarge':'notesDraftUnavailable'));
    }
    saveManager.mark(snapshot);
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>{void flush();},350);
  };
  const list = () => {
    rememberTemplatePanel();
    currentId=null;currentSaveNow=null;
    // Do not auto-delete even seemingly already saved drafts: this list may
    // be stale if another browser tab has changed IndexedDB.
    const recovery=draftStore.list();
    const pending=recovery.drafts;
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">03 / MYHUB</span><h1>${t('notes')}</h1><p>${t('notesDesc')}</p></section>
      <div class="notes-toolbar"><input id="note-search" class="text-field" type="search" maxlength="200" placeholder="${t('notesSearch')}" value="${escapeHtml(search)}">
      <div class="notes-filters"><label for="note-scope">${t('notesFilter')}<select class="input-select" id="note-scope"><option value="all">${t('notesAll')}</option><option value="pinned">${t('notesPinned')}</option><option value="favourites">${t('notesFavourites')}</option></select></label>
      <label for="note-order">${t('notesSort')}<select class="input-select" id="note-order"><option value="newest">${t('notesNewest')}</option><option value="oldest">${t('notesOldest')}</option><option value="title">${t('notesTitleSort')}</option></select></label>
      ${noteCategories(notes,locale).length ? `<label class="notes-category-filter" for="note-category-filter">${t('notesCategory')}<select class="input-select" id="note-category-filter"><option value="*">${t('notesAllCategories')}</option><option value="">${t('notesNoCategory')}</option>${noteCategories(notes,locale).map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select></label>` : ''}</div>
      <div class="notes-actions"><button class="primary-btn" id="create-text">+ ${t('newNote')}</button><button class="secondary-btn" id="create-checklist">☑ ${t('newChecklist')}</button><button type="button" class="secondary-btn" id="open-notes-trash">🗑 ${t('trashTitle')} (${trash?.items.length ?? '?'})</button><button type="button" class="secondary-btn" id="toggle-notes-bulk" aria-pressed="${bulkMode}">${t(bulkMode?'notesBulkCancel':'notesBulkSelect')}</button></div><p class="notes-count" id="notes-count" aria-live="polite"></p>
      ${bulkMode?`<div class="notes-bulk-panel" aria-label="${t('notesBulkSelect')}">
        <div class="notes-bulk-top"><strong id="notes-bulk-count" role="status">${t('notesBulkCount').replace('{n}','0')}</strong><button type="button" class="secondary-btn" id="notes-bulk-select-visible">${t('notesBulkSelectVisible')}</button></div>
        <label for="notes-bulk-category">${t('notesBulkDestination')}</label>
        <input type="text" class="text-field" id="notes-bulk-category" maxlength="40" list="notes-bulk-suggestions" autocomplete="off" placeholder="${t('notesBulkPlaceholder')}">
        <datalist id="notes-bulk-suggestions">${noteCategories(notes,locale).map(c=>`<option value="${escapeHtml(c)}"></option>`).join('')}</datalist>
        <p class="notes-bulk-hint">${t('notesBulkHint')}</p>
        <button type="button" class="primary-btn" id="notes-bulk-apply" disabled>${t('notesBulkApply')}</button>
      </div>`:''}</div>
      ${pending.length?`<section class="notes-draft-panel" aria-label="${t('notesDraftPanel')}"><h2>↶ ${t('notesDraftPanel')} (${pending.length})</h2><p>${t('notesDraftHint')}</p>${pending.some(entry=>entry.pendingChecklist)?`<p class="muted">${t('notesPendingRowsHint')}</p>`:''}<div class="notes-draft-list">${pending.map(entry=>{
        const draft=entry.draft;
        const title=draft.title.trim()||t(draft.kind==='checklist'?'newChecklist':'newNote');
        const date=new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(entry.editedAt));
        return `<div class="notes-draft-card"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(date)}</small><div class="notes-draft-actions"><button type="button" class="primary-btn" data-draft-restore="${escapeHtml(entry.key)}">${t('notesDraftRestore')}</button><button type="button" class="secondary-btn" data-draft-copy="${escapeHtml(entry.key)}">${t('notesDraftSaveCopy')}</button><button type="button" class="secondary-btn" data-draft-discard="${escapeHtml(entry.key)}">${t('notesDraftDiscard')}</button></div></div>`;
      }).join('')}</div></section>`:''}
      ${recovery.corrupt?`<p class="warning-text" role="alert">${t('notesDraftCorrupt')}</p>`:''}
      ${lastDeleted ? `<div class="notes-undo" role="status"><span>${t('notesDeletedUndo')}</span><button type="button" class="secondary-btn" id="undo-delete-note">${t('notesUndo')}</button></div>` : ''}
      <details class="notes-templates-panel" id="notes-templates-panel"><summary>📋 ${t('notesTemplatesTitle')} (${templates.items.length})</summary><p>${t('notesTemplatesHint')}</p>
        <input id="notes-template-search" class="text-field" type="search" maxlength="100" placeholder="${t('notesTemplateSearch')}" aria-label="${t('notesTemplateSearch')}" ${templates.items.length?'':'hidden'}>
        <div class="notes-templates-list" id="notes-templates-list"></div></details>
      ${!bulkMode&&notes.length>3?`<section class="notes-recent-strip" id="notes-recent-strip" aria-label="${t('notesRecentTitle')}"><strong>${t('notesRecentTitle')}</strong><div class="notes-recent-buttons">${recentNotes(notes).map(note=>`<button type="button" data-recent-note="${escapeHtml(note.id)}" title="${escapeHtml(note.title.trim()||t(note.kind==='checklist'?'newChecklist':'newNote'))}">${escapeHtml(note.title.trim()||t(note.kind==='checklist'?'newChecklist':'newNote'))}</button>`).join('')}</div></section>`:''}
      <div class="notes-filter-reset"><button type="button" class="text-link" id="notes-reset-filters" hidden>${t('notesResetFilters')}</button></div>
      <div id="notes-list" class="notes-grid"></div><div class="notes-pagination"><span id="notes-page-count" class="muted" aria-live="polite"></span><button type="button" class="secondary-btn" id="notes-show-more" hidden>${t('notesShowMore')}</button></div>`;
    element.querySelector('.notes-draft-list')?.addEventListener('click',async event=>{
      const action=event.target.closest('[data-draft-restore],[data-draft-copy],[data-draft-discard]');
      if(!action || action.disabled)return;
      const key=action.dataset.draftRestore||action.dataset.draftCopy||action.dataset.draftDiscard;
      const recovered=draftStore.read(key);
      if(!recovered){notify(t('notesDraftUnavailable'));list();return;}
      if(action.hasAttribute('data-draft-discard')){
        if(!confirmAction(t('notesDraftDiscardConfirm')))return;
        if(!draftStore.removeIfUnchanged(key,recovered.raw))notify(t('notesDraftUnavailable'));
        list();return;
      }
      action.disabled=true;
      try{
        // Refresh the saved baseline before any decision. The list may be stale
        // because another tab edited or deleted the same note.
        const fresh=(await getNotes()).filter(valid);
        if(disposed)return;
        const saved=fresh.find(n=>n.id===recovered.draft.id);
        if(action.hasAttribute('data-draft-restore')){
          if(saved && notesMatch(saved,recovered.draft) && !recovered.pendingChecklist){
            draftStore.removeIfUnchanged(key,recovered.raw);
            notes=fresh;list();notify(t('notesDraftAlreadySaved'));return;
          }
          if(!saved || (!notesMatch(saved,recovered.baseline) && !notesMatch(saved,recovered.draft))){
            notify(t('notesDraftChangedUseCopy'));notes=fresh;list();return;
          }
          notes=fresh;
          editor(saved.id,recovered);
          notify(t(recovered.pendingChecklist?'notesPendingRowsRestored':'notesDraftLoaded'));
        }else{
          if(fresh.length>=MAX_NOTES){notify(t('notesLimit'));action.disabled=false;return;}
          const stamp=new Date().toISOString();
          const duplicate=safeClone(recovered.draft);
          duplicate.id=uid();duplicate.title=(duplicate.title||t('newNote')).slice(0,200-t('notesDraftCopySuffix').length)+t('notesDraftCopySuffix');
          duplicate.createdAt=stamp;duplicate.updatedAt=stamp;
          await restoreDeletedNote(duplicate); // Uses IDB add; never overwrites.
          if(disposed)return;
          notes=[...fresh,duplicate];
          const mirrored=editor(duplicate.id,null,recovered.pendingChecklist?
            {single:recovered.pendingChecklist.single,batch:recovered.pendingChecklist.batch,origin:recovered}:null);
          if(!recovered.pendingChecklist || mirrored)draftStore.removeIfUnchanged(key,recovered.raw);
          if(!mirrored)notify(t('notesDraftUnavailable'));
          notify(t('notesDraftCopySaved'));
        }
      }catch(error){notify(`${t('error')}: ${error.message}`);if(action.isConnected)action.disabled=false;}
    });
    const templatesPanel=element.querySelector('#notes-templates-panel');
    const templatesRows=element.querySelector('#notes-templates-list');
    const templatesSearch=element.querySelector('#notes-template-search');
    templatesPanel.open=templatePanelOpen;
    templatesSearch.value=templateQuery;
    templatesPanel.addEventListener('toggle',()=>{
      if(templatesPanel.isConnected)templatePanelOpen=templatesPanel.open;
    });
    // Keep template details in a collapsed Notes-only section.
    const renderTemplates=()=>{
      if(!templatesRows?.isConnected)return;
      const q=(templatesSearch?.value||'').trim().toLocaleLowerCase();
      const found=templates.items.filter(entry=>(entry.name+' '+entry.title).toLocaleLowerCase().includes(q));
      templatesRows.innerHTML=found.length?found.map(entry=>`<div class="notes-template-card"><div class="notes-template-text"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.kind==='checklist'?t('newChecklist'):t('newNote'))} · ${entry.kind==='checklist'?entry.items.length+' ✓':escapeHtml(entry.title||'—')}</small></div><div class="notes-template-actions"><button type="button" class="primary-btn" data-template-use="${escapeHtml(entry.id)}">${t('notesTemplateUse')}</button><button type="button" class="secondary-btn" data-template-rename="${escapeHtml(entry.id)}" ${templatesReadOnly?'disabled':''}>${t('notesTemplateRename')}</button><button type="button" class="secondary-btn" data-template-delete="${escapeHtml(entry.id)}" ${templatesReadOnly?'disabled':''}>${t('notesTemplateDelete')}</button></div></div>`).join(''):`<p class="muted">${t('notesTemplatesEmpty')}</p>`;
    };
    templatesSearch.addEventListener('input',()=>{templateQuery=templatesSearch.value;renderTemplates();});
    templatesRows.addEventListener('click',async event=>{
      const button=event.target.closest('[data-template-use],[data-template-rename],[data-template-delete]');
      if(!button||button.disabled)return;
      const id=button.dataset.templateUse||button.dataset.templateRename||button.dataset.templateDelete;
      const template=templates.items.find(entry=>entry.id===id);
      if(!template)return;
      if(button.hasAttribute('data-template-delete')&&!confirmAction(t('notesTemplateDeleteConfirm')))return;
      let newName=null;
      if(button.hasAttribute('data-template-rename')){
        newName=window.prompt(t('notesTemplateRenamePrompt'),template.name);
        if(newName===null)return;
      }
      button.disabled=true;
      try{
        if(button.hasAttribute('data-template-use')){
          // Read the latest count within IndexedDB; do not overwrite any note.
          const note=noteFromTemplate(template,{id:uid(),newItemId:uid,now:new Date().toISOString()});
          await restoreDeletedNote(note);
          if(disposed)return;
          notes.push(note);editor(note.id);notify(t('notesTemplateCreated'));
        }else if(button.hasAttribute('data-template-rename')){
          const next=templateRename(templates,id,newName,new Date().toISOString());
          await updateTemplates(next);
          if(disposed)return;
          renderTemplates();notify(t('notesTemplateUpdated'));
        }else{
          await updateTemplates(templateRemove(templates,id));
          if(disposed)return;
          list();notify(t('notesTemplateDeleted'));
        }
      }catch(err){
        if(disposed)return;
        notify(err.message==='Template limit reached'?t('notesTemplateLimit'):(err.message.includes('Invalid')?t('notesTemplateInvalid'):t('notesTemplateError')));
        if(err.code==='stale-meta'){
          try{const raw=await getMeta('notesTemplatesData');if(raw!==undefined&&!validNotesTemplates(raw))throw Error('Invalid');templatesBaseline=raw;templates=raw===undefined?emptyNotesTemplates():raw;list();}catch{templatesReadOnly=true;notify(t('notesTemplateCorrupt'));}
        }else if(button.isConnected)button.disabled=false;
      }
    });
    renderTemplates();
    const searchInput=element.querySelector('#note-search');
    const resultList=element.querySelector('#notes-list');
    element.querySelector('#notes-recent-strip')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-recent-note]');
      if(!button||!element.contains(button)||quickActionBusy)return;
      if(notes.some(n=>n.id===button.dataset.recentNote))editor(button.dataset.recentNote);
    });
    const showMore=element.querySelector('#notes-show-more');
    const pageCount=element.querySelector('#notes-page-count');
    const scopeInput=element.querySelector('#note-scope');
    const orderInput=element.querySelector('#note-order');
    const categoryInput=element.querySelector('#note-category-filter');
    scopeInput.value=scope;orderInput.value=order;
    if(categoryFilter!=='*' && categoryFilter!=='' && !noteCategories(notes,locale).some(c=>c.toLocaleLowerCase()===categoryFilter.toLocaleLowerCase()))categoryFilter='*';
    if(categoryInput)categoryInput.value=categoryFilter;
    // Reuse normalised search text and timestamps while this list is open.
    // Notes mutations in this view replace the array; returning from an editor
    // creates a new view and index, so no stale note text is retained.
    let indexedNotes=notes;
    let selector=createNotesSelector(notes);
    const visibleNotes=()=>{
      if(notes!==indexedNotes){indexedNotes=notes;selector=createNotesSelector(notes);}
      return selector.select({query:search,scope,order,locale,category:categoryFilter});
    };
    const noteDateFormatter=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short'});
    const renderList=() => {
      const visible=visibleNotes();
      const page=sliceNotesPage(visible,displayedLimit);
      element.querySelector('#notes-count').textContent=t('notesCount').replace('{shown}',String(visible.length)).replace('{total}',String(notes.length));
      const hasFilters=Boolean(search.trim())||scope!=='all'||order!=='newest'||categoryFilter!=='*';
      const reset=element.querySelector('#notes-reset-filters');
      if(reset)reset.hidden=!hasFilters;
      const recentStrip=element.querySelector('#notes-recent-strip');
      if(recentStrip)recentStrip.hidden=hasFilters;
      pageCount.textContent=visible.length>page.length ? t('notesShowingPage').replace('{shown}',String(page.length)).replace('{total}',String(visible.length)) : '';
      showMore.hidden=page.length>=visible.length;
      resultList.innerHTML=visible.length ? page.map(n => {
        const summary=n.kind==='checklist' ? `${n.items.filter(i=>i.done).length}/${n.items.length} ✓ · ${n.items.slice(0,2).map(i=>i.text).join(', ')}` : n.body.slice(0,110);
        const label=n.title.trim() || (n.kind==='checklist' ? t('newChecklist') : t('newNote'));
        const content=`<div class="row-between"><span class="note-type">${n.kind==='checklist'?'☑':'✎'} ${n.kind==='checklist' ? t('newChecklist') : t('newNote')}</span><span>${n.pinned?'📌 ':''}${n.favourite?'★':''}</span></div>
          <strong>${escapeHtml(label)}</strong>${categoryName(n.category) ? `<span class="note-category-chip">${escapeHtml(categoryName(n.category))}</span>` : ''}<span class="note-preview">${escapeHtml(summary) || '—'}</span>
          <small>${noteDateFormatter.format(new Date(n.updatedAt))}</small>`;
        return bulkMode ? `<label class="note-card notes-select-card"><span class="notes-select-control"><input type="checkbox" data-select-note="${escapeHtml(n.id)}" ${selectedIds.has(n.id)?'checked':''}><span>${t('notesBulkSelect')}</span></span>${content}</label>`
          : `<div class="notes-card-shell"><button class="note-card" type="button" data-note-id="${escapeHtml(n.id)}">${content}</button><div class="notes-quick-actions"><button type="button" data-quick-id="${escapeHtml(n.id)}" data-quick-flag="pinned" aria-label="${n.pinned?t('unpin'):t('pin')}" title="${n.pinned?t('unpin'):t('pin')}" aria-pressed="${Boolean(n.pinned)}" ${quickActionBusy?'disabled':''}>📌</button><button type="button" data-quick-id="${escapeHtml(n.id)}" data-quick-flag="favourite" aria-label="${n.favourite?t('unfavourite'):t('favourite')}" title="${n.favourite?t('unfavourite'):t('favourite')}" aria-pressed="${Boolean(n.favourite)}" ${quickActionBusy?'disabled':''}>${n.favourite?'★':'☆'}</button></div></div>`;
      }).join('') : `<div class="empty-state">${search ? t('notesNoResults') : t('notesEmpty')}</div>`;
      if(bulkMode){
        const counter=element.querySelector('#notes-bulk-count');
        if(counter)counter.textContent=t('notesBulkCount').replace('{n}',String(selectedIds.size));
        const apply=element.querySelector('#notes-bulk-apply');
        if(apply)apply.disabled=selectedIds.size===0;
        const selectAll=element.querySelector('#notes-bulk-select-visible');
        if(selectAll)selectAll.disabled=visible.length===0;
      }
    };
    showMore.addEventListener('click',()=>{
      const count=visibleNotes().length;
      displayedLimit=nextNotesPageLimit(displayedLimit,count);
      renderList();
    });
    // Coalesce rapid typing so a large local collection does not repaint every keystroke.
    // Search still covers ALL records (the 40-item limit affects rendering only).
    let searchPaintTimer=null;
    searchInput.addEventListener('input', () => {
      search=searchInput.value;displayedLimit=NOTES_PAGE_SIZE;selectedIds.clear();
      clearTimeout(searchPaintTimer);
      searchPaintTimer=setTimeout(()=>{
        searchPaintTimer=null;
        if(searchInput.isConnected)renderList();
      },140);
    });
    scopeInput.addEventListener('change',()=>{clearTimeout(searchPaintTimer);scope=scopeInput.value;displayedLimit=NOTES_PAGE_SIZE;selectedIds.clear();renderList();});
    orderInput.addEventListener('change',()=>{clearTimeout(searchPaintTimer);order=orderInput.value;displayedLimit=NOTES_PAGE_SIZE;renderList();});
    categoryInput?.addEventListener('change',()=>{clearTimeout(searchPaintTimer);categoryFilter=categoryInput.value;displayedLimit=NOTES_PAGE_SIZE;selectedIds.clear();renderList();});
    element.querySelector('#notes-reset-filters').addEventListener('click',()=>{
      clearTimeout(searchPaintTimer);search='';scope='all';order='newest';categoryFilter='*';displayedLimit=NOTES_PAGE_SIZE;selectedIds.clear();
      searchInput.value='';scopeInput.value=scope;orderInput.value=order;
      if(categoryInput)categoryInput.value=categoryFilter;
      renderList();searchInput.focus();
    });
    element.querySelector('#create-text').addEventListener('click',()=>{void create('text');});
    element.querySelector('#create-checklist').addEventListener('click',()=>{void create('checklist');});
    element.querySelector('#open-notes-trash').addEventListener('click',()=>trashList());
    element.querySelector('#toggle-notes-bulk').addEventListener('click',()=>{
      bulkMode=!bulkMode;selectedIds.clear();list();
    });
    if(bulkMode){
      resultList.addEventListener('change',event=>{
        const checkbox=event.target.closest('[data-select-note]');
        if(!checkbox)return;
        const id=checkbox.dataset.selectNote;
        if(checkbox.checked){
          if(selectedIds.size>=MAX_BULK_NOTES){checkbox.checked=false;notify(t('notesBulkLimit'));return;}
          selectedIds.add(id);
        }else selectedIds.delete(id);
        const counter=element.querySelector('#notes-bulk-count');
        if(counter)counter.textContent=t('notesBulkCount').replace('{n}',String(selectedIds.size));
        element.querySelector('#notes-bulk-apply').disabled=selectedIds.size===0;
      });
      element.querySelector('#notes-bulk-select-visible').addEventListener('click',()=>{
        const visible=visibleNotes();
        selectedIds.clear();
        for(const n of visible.slice(0,MAX_BULK_NOTES))selectedIds.add(n.id);
        if(visible.length>MAX_BULK_NOTES)notify(t('notesBulkLimit'));
        renderList();
      });
      element.querySelector('#notes-bulk-apply').addEventListener('click',async event=>{
        const snapshots=notes.filter(n=>selectedIds.has(n.id)).map(safeClone);
        if(!snapshots.length)return;
        const rawCategory=element.querySelector('#notes-bulk-category').value;
        const destination=categoryName(rawCategory);
        if(rawCategory.trim() && !destination){notify(t('notesBulkBadCategory'));return;}
        const question=t(destination?'notesBulkConfirm':'notesBulkClearConfirm')
          .replace('{n}',String(snapshots.length)).replace('{category}',destination);
        if(!confirmAction(question))return;
        const button=event.currentTarget;button.disabled=true;
        try{
          const changed=await changeNotesCategories(snapshots,destination);
          if(disposed)return;
          const replacements=new Map(changed.map(n=>[n.id,n]));
          notes=notes.map(n=>replacements.get(n.id)||n);
          bulkMode=false;selectedIds.clear();
          // Category filters may no longer have matching notes; return to All.
          categoryFilter='*';
          list();notify(t('notesBulkDone').replace('{n}',String(changed.length)));
        }catch(error){
          if(disposed)return;
          button.disabled=false;
          notify(`${t('notesBulkFailed')}: ${error.message}`);
        }
      });
    }

    const undoBtn=element.querySelector('#undo-delete-note');
    if(undoBtn)undoBtn.addEventListener('click',async()=>{
      if(!lastDeleted)return;
      undoBtn.disabled=true;
      try{
        const restored=await restoreTrashedNote(lastDeleted);
        if(disposed)return;
        notes.push(restored);
        trash=await getNotesTrash();
        lastDeleted=null;
        list();
        notify(t('notesUndoSuccess'));
      }catch(error){
        if(disposed)return;
        undoBtn.disabled=false;
        notify(`${t('notesUndoFailed')}: ${error.message}`);
      }
    });
    resultList.addEventListener('click',async event=>{
      const quick=event.target.closest('[data-quick-id][data-quick-flag]');
      if(quick){
        if(bulkMode||quickActionBusy)return;
        const note=notes.find(n=>n.id===quick.dataset.quickId);
        if(!note)return;
        const flag=quick.dataset.quickFlag;
        // Rebuilding a sorted list replaces the clicked button. Restore keyboard
        // focus to the equivalent action only if it was focused before repaint.
        const shouldRestoreFocus=document.activeElement===quick;
        quickActionBusy=true;
        resultList.querySelectorAll('[data-quick-flag]').forEach(btn=>{btn.disabled=true;});
        try{
          const updated=await toggleNoteQuickFlag(safeClone(note),flag);
          if(disposed)return;
          notes=notes.map(n=>n.id===updated.id?updated:n);
          renderList();
        }catch(error){
          if(disposed)return;
          // A stale tab must be refreshed; do not retry an unsafe write.
          try { notes=(await getNotes()).filter(valid); }catch{/* keep old in-memory view */}
          if(disposed)return;
          notify(`${t('notesQuickFailed')}: ${error.message}`);
          renderList();
        }finally{
          quickActionBusy=false;
          if(!disposed){
            resultList.querySelectorAll('[data-quick-flag]').forEach(btn=>{btn.disabled=false;});
            if(shouldRestoreFocus){
              const replacement=matchingQuickAction(resultList,note.id,flag);
              replacement?.focus({preventScroll:true});
            }
          }
        }
        return;
      }
      const btn=event.target.closest('[data-note-id]');
      if(btn && !bulkMode && !quickActionBusy) editor(btn.dataset.noteId);
    });
    renderList();
  };
  // Trash is an explicit, independent view. No autosave in it, and no
  // automatic permanent deletion, expiration or pruning.
  const trashList = () => {
    rememberTemplatePanel();
    currentId=null;
    const items=trash?.items ?? [];
    const rows=[...items].reverse().map(({note,deletedAt})=>{
      const label=note.title.trim() || t(note.kind==='text'?'newNote':'newChecklist');
      const description=note.kind==='text' ? note.body.slice(0,140) : note.items.slice(0,3).map(row=>(row.done?'☑ ':'☐ ')+row.text).join(' · ');
      const date=new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(new Date(deletedAt));
      return `<div class="surface trash-card"><div class="row-between"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(date)}</small></div><p class="note-preview">${escapeHtml(description)||'—'}</p><div class="editor-actions"><button type="button" class="secondary-btn" data-restore-trash="${escapeHtml(note.id)}">${t('trashRestore')}</button><button type="button" class="danger-btn" data-purge-trash="${escapeHtml(note.id)}">${t('trashPurge')}</button></div></div>`;
    }).join('');
    element.innerHTML=`<div class="editor-top"><button class="back-btn" type="button" id="back-trash-notes">‹ ${t('backToNotes')}</button></div>
      <section class="tool-head"><span class="eyebrow">NOTES / TRASH</span><h1>${t('trashTitle')}</h1><p>${t('trashInfo')}</p></section>
      ${trash===null?`<p class="warning-text" role="alert">${t('trashCorrupt')}</p>`:
        items.length?`<div class="notes-trash-list">${rows}</div><div class="notes-trash-footer"><button type="button" class="danger-btn" id="empty-notes-trash">${t('trashEmptyAll')} (${items.length})</button></div>`:
        `<div class="empty-state">${t('trashEmpty')}</div>`}`;
    element.querySelector('#back-trash-notes').addEventListener('click',()=>list());
    element.querySelector('.notes-trash-list')?.addEventListener('click',async event=>{
      const restore=event.target.closest('[data-restore-trash]');
      const purge=event.target.closest('[data-purge-trash]');
      const button=restore||purge;
      if(!button || button.disabled)return;
      const id=restore?.dataset.restoreTrash ?? purge?.dataset.purgeTrash;
      if(purge && !confirmAction(t('trashPurgeConfirm')))return;
      button.disabled=true;
      try{
        if(restore){
          const note=await restoreTrashedNote(id);
          if(disposed)return;
          notes.push(note);
          notify(t('trashRestored'));
        }else{
          await purgeTrashedNote(id);
          if(disposed)return;
          notify(t('trashPurged'));
        }
        trash=await getNotesTrash();
        if(lastDeleted===id)lastDeleted=null;
        trashList();
      }catch(error){
        if(disposed)return;
        button.disabled=false;
        notify(`${t('error')}: ${error.message}`);
      }
    });
    element.querySelector('#empty-notes-trash')?.addEventListener('click',async event=>{
      if(!confirmAction(t('trashEmptyConfirm')))return;
      const button=event.currentTarget;button.disabled=true;
      try{
        await emptyNotesTrashForever();
        if(disposed)return;
        trash=await getNotesTrash();lastDeleted=null;
        trashList();notify(t('trashPurged'));
      }catch(error){
        if(disposed)return;
        button.disabled=false;notify(`${t('error')}: ${error.message}`);
      }
    });
  };
  const create=async kind => {
    if(notes.length>=MAX_NOTES){notify(t('notesLimit'));return;}
    const note=makeNote(kind);
    try { await putNote(note); notes.push(note); editor(note.id); }
    catch(err){notify(`${t('error')}: ${err.message}`);}
  };
  const editor = (id,recovered=null,pendingOverride=null) => {
    rememberTemplatePanel();
    let recoveryMirrorOk=true;
    currentId=id;
    const n=current();
    if(!n){list();return;}
    expectedSavedNote=safeClone(n);
    editorDraftKey=draftStore.makeKey(uid());
    recoveryOrigin=recovered;
    draftWarningShown=false;
    if(recovered)Object.assign(n,safeClone(recovered.draft));
    element.innerHTML=`<div class="editor-top"><button class="back-btn" type="button" id="back-notes">‹ ${t('backToNotes')}</button><div class="notes-save-inline"><span class="save-status" id="note-status" role="status" aria-live="polite">${t('saved')}</span><button type="button" class="secondary-btn" id="notes-save-now" hidden>${t('notesSaveNow')}</button></div></div>
      <div class="notes-save-recovery" id="notes-save-recovery" role="alert" hidden><strong>${t('notesSaveFailed')}</strong><p id="notes-save-message">${t('notesSaveHelp')}</p><div class="notes-save-recovery-actions"><button type="button" class="primary-btn" id="notes-save-retry">${t('notesSaveRetry')}</button><button type="button" class="secondary-btn" id="notes-save-copy">${t('notesSaveCopy')}</button></div></div>
      <article class="surface note-editor"><input class="note-title-input" id="note-title" maxlength="200" placeholder="${t('titlePlaceholder')}" value="${escapeHtml(n.title)}" aria-label="${t('titlePlaceholder')}">
      <label class="note-category-editor" for="note-category">${t('notesCategory')} <small>(${t('notesOptional')})</small><input class="text-field" id="note-category" type="text" maxlength="40" list="note-category-suggestions" autocomplete="off" placeholder="${t('notesCategoryPlaceholder')}" value="${escapeHtml(n.category || '')}"></label>
      <datalist id="note-category-suggestions">${noteCategories(notes,locale).map(c=>`<option value="${escapeHtml(c)}"></option>`).join('')}</datalist>
      ${n.kind==='text' ? `<textarea id="note-body" maxlength="100000" rows="11" class="note-body" placeholder="${t('textPlaceholder')}" aria-label="${t('textPlaceholder')}">${escapeHtml(n.body)}</textarea>` :
      `<div class="checklist-tools"><span id="checklist-progress" class="muted" aria-live="polite"></span><div class="checklist-tool-buttons"><button type="button" class="secondary-btn" id="check-all">${t('checklistCheckAll')}</button><button type="button" class="secondary-btn" id="uncheck-all">${t('checklistUncheckAll')}</button><button type="button" class="secondary-btn" id="toggle-done-visibility" aria-pressed="false">${t('checklistHideDone')}</button></div></div><div id="checklist-items" class="checklist-items"></div><div class="form-row"><input class="text-field" id="new-item" maxlength="2000" placeholder="${t('checklistPlaceholder')}"><button type="button" class="primary-btn" id="add-item">+ ${t('add')}</button></div><details class="checklist-bulk"><summary>${t('checklistMultiAdd')}</summary><label for="checklist-paste">${t('checklistPasteHint')}</label><textarea id="checklist-paste" class="text-field" rows="4" placeholder="${t('checklistPastePlaceholder')}"></textarea><button type="button" class="secondary-btn" id="add-many-items">${t('checklistAddMany')}</button></details>`}
      <div class="editor-actions"><button type="button" class="secondary-btn" id="copy-note">⧉ ${t('copy')}</button><button type="button" class="secondary-btn" id="duplicate-note">${t('notesDuplicate')}</button><button type="button" class="secondary-btn" id="save-note-template" ${templatesReadOnly?'disabled':''}>📋 ${t('notesTemplateSave')}</button><button type="button" class="secondary-btn" id="share-note">${t('notesShare')}</button><button type="button" class="secondary-btn cross-shortcut" id="note-to-task">${t('crossToTask')}</button><button type="button" class="secondary-btn" id="pin-note">${n.pinned?'📌 '+t('unpin'):'📌 '+t('pin')}</button>
      <button type="button" class="secondary-btn" id="star-note">${n.favourite?'★ '+t('unfavourite'):'☆ '+t('favourite')}</button>
      <button type="button" class="danger-btn" id="delete-note">${t('delete')}</button></div></article>`;
    const update = () => {n.updatedAt=new Date().toISOString();schedule();};
    // A recovered draft is still unsaved until the CAS IndexedDB transaction
    // commits. Mirror it to this new editor session before autosave begins.
    if(recovered && !notesMatch(expectedSavedNote,n))schedule();
    currentSaveNow=async()=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return false;}
      const ok=await flush();
      if(ok&&!disposed)notify(t('notesSavedNow'));
      return ok;
    };
    element.querySelector('#notes-save-now').addEventListener('click',()=>{void currentSaveNow?.();});
    element.querySelector('#notes-save-retry').addEventListener('click',async event=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}
      event.currentTarget.disabled=true;
      const ok=await flush();
      if(ok)notify(t('notesSaveRecovered'));
      else if(event.currentTarget.isConnected)event.currentTarget.disabled=false;
    });
    element.querySelector('#notes-save-copy').addEventListener('click',async()=>{
      try { await navigator.clipboard.writeText(plainNoteText(n));notify(t('copied')); }
      catch { notify(t('notesSaveCopyFailed')); }
    });
    const title=element.querySelector('#note-title');
    title.addEventListener('input',()=>{n.title=title.value;update();});
    const categoryEditor=element.querySelector('#note-category');
    categoryEditor.addEventListener('input',()=>{n.category=categoryEditor.value;update();});
    categoryEditor.addEventListener('change',()=>{n.category=categoryName(categoryEditor.value);categoryEditor.value=n.category;update();});
    const body=element.querySelector('#note-body');
    if(body) body.addEventListener('input',()=>{n.body=body.value;update();});
    const checklist=element.querySelector('#checklist-items');
    if(checklist){
      let hideCompleted=false;
      const renderItems=()=>{
        const progress=checklistProgress(n.items);
        const progressElement=element.querySelector('#checklist-progress');
        if(progressElement) progressElement.textContent=t('checklistProgress').replace('{done}',String(progress.done)).replace('{total}',String(progress.total));
        const shown = n.items.map((item, index) => (hideCompleted && item.done ? -1 : index)).filter(index => index >= 0);
        const firstVisible = shown[0], lastVisible = shown.at(-1);
        checklist.innerHTML=n.items.map((item,index)=>`<div class="checklist-row" ${hideCompleted && item.done?'hidden':''}><label class="check-row-label"><input type="checkbox" data-done="${index}" ${item.done?'checked':''} aria-label="${t('done')}"><span></span></label>
          <input class="check-text" maxlength="2000" data-item-text="${index}" value="${escapeHtml(item.text)}" aria-label="${t('checklistPlaceholder')}">
          <span class="checklist-move-controls"><button class="checklist-move-btn" type="button" data-move-item="${index}" data-move-direction="up" aria-label="${t('moveUp')}: ${escapeHtml(item.text)}" title="${t('moveUp')}" ${index===firstVisible || (hideCompleted && item.done)?'disabled':''}>↑</button>
          <button class="checklist-move-btn" type="button" data-move-item="${index}" data-move-direction="down" aria-label="${t('moveDown')}: ${escapeHtml(item.text)}" title="${t('moveDown')}" ${index===lastVisible || (hideCompleted && item.done)?'disabled':''}>↓</button></span>
          <button class="icon-btn subtle" type="button" data-delete-item="${index}" aria-label="${t('deleteItem')}">×</button></div>`).join('');
      };
      checklist.addEventListener('input',event=>{
        if (event.target.matches('[data-item-text]')) {
          const idx=Number(event.target.dataset.itemText);
          if (n.items[idx]) {n.items[idx].text=event.target.value;update();}
        }
      });
      checklist.addEventListener('change',event=>{
        if(event.target.matches('[data-done]')){
          const idx=Number(event.target.dataset.done);
          if(n.items[idx]){n.items[idx].done=event.target.checked;update();renderItems();}
        }
      });
      checklist.addEventListener('click',event=>{
        const move=event.target.closest('[data-move-item]');
        if(move && !move.disabled){
          const idx=Number(move.dataset.moveItem);
          const direction=move.dataset.moveDirection==='up'?-1:1;
          try {
            const moved=moveChecklistRow(n.items,idx,direction,{skipCompleted:hideCompleted});
            if(!moved)return;
            n.items=moved.items;
            update();renderItems();
            // Keep keyboard and screen-reader focus on the same moved row.
            const target=checklist.querySelector(`[data-move-item="${moved.index}"][data-move-direction="${move.dataset.moveDirection}"]`);
            (target?.disabled ? checklist.querySelector(`[data-move-item="${moved.index}"][data-move-direction="${direction===-1?'down':'up'}"]`) : target)?.focus({preventScroll:true});
          } catch(error){notify(`${t('error')}: ${error.message}`);}
          return;
        }
        const button=event.target.closest('[data-delete-item]');
        if(button){n.items.splice(Number(button.dataset.deleteItem),1);update();renderItems();}
      });
      const itemInput=element.querySelector('#new-item');
      const pasteInput=element.querySelector('#checklist-paste');
      const persistPendingInput=()=>{
        const result=draftStore.writePending(editorDraftKey,expectedSavedNote,safeClone(n),{
          single:itemInput.value,batch:pasteInput.value
        });
        if(!result.ok && !draftWarningShown){
          draftWarningShown=true;
          notify(t(result.reason==='too-large'?'notesDraftTooLarge':'notesDraftUnavailable'));
        }
        updateSaveStatus(saveManager.state());
        return result.ok;
      };
      itemInput.addEventListener('input',persistPendingInput);
      pasteInput.addEventListener('input',persistPendingInput);
      const restoredFields=pendingOverride||recovered?.pendingChecklist;
      let pendingRestored=true;
      if(restoredFields){
        itemInput.value=restoredFields.single;
        pasteInput.value=restoredFields.batch;
        pendingRestored=persistPendingInput();
        recoveryMirrorOk=pendingRestored;
        if(pendingRestored && recovered){
          draftStore.removeIfUnchanged(recovered.key,recovered.raw);
          recoveryOrigin=null; // new per-editor snapshot contains all unsaved work
        }
      }

      const addItem=()=>{
        const text=itemInput.value.trim();
        if(!text || n.items.length>=300) return;
        n.items.push({id:uid(), text, done:false});
        itemInput.value='';update();persistPendingInput();renderItems();itemInput.focus();
      };
      element.querySelector('#add-item').addEventListener('click',addItem);
      itemInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addItem();}});
      element.querySelector('#check-all').addEventListener('click',()=>{
        if(!n.items.some(row=>!row.done))return;
        n.items=setChecklistCompletion(n.items,true);update();renderItems();
      });
      element.querySelector('#uncheck-all').addEventListener('click',()=>{
        if(!n.items.some(row=>row.done))return;
        n.items=setChecklistCompletion(n.items,false);update();renderItems();
      });
      element.querySelector('#toggle-done-visibility').addEventListener('click',event=>{
        hideCompleted=!hideCompleted;
        event.currentTarget.setAttribute('aria-pressed',String(hideCompleted));
        event.currentTarget.textContent=t(hideCompleted?'checklistShowDone':'checklistHideDone');
        renderItems();
      });
      element.querySelector('#add-many-items').addEventListener('click',()=>{
        const field=element.querySelector('#checklist-paste');
        let lines;
        try{ lines=parseChecklistBatch(field.value,n.items.length); }
        catch(error){
          const key=error.message==='empty-batch'?'checklistNoLines':error.message==='batch-limit'?'checklistTooMany':'checklistInvalidLines';
          notify(t(key));return;
        }
        // Validate all rows before mutating the note. No silent truncation.
        const rows=lines.map(text=>({id:uid(),text,done:false}));
        n.items.push(...rows);field.value='';update();persistPendingInput();renderItems();
        notify(t('checklistAdded').replace('{n}',String(rows.length)));
      });
      renderItems();
      if(restoredFields && pendingOverride)notify(t('notesPendingRowsRestored'));
      // A recovered copy may remove its origin only after the new session
      // successfully mirrors the unadded fields to localStorage.
    }
    element.querySelector('#copy-note').addEventListener('click',async()=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}
      await flush();
      if(dirty){notify(t('crossSaveFirst'));return;}
      try {await navigator.clipboard.writeText(plainNoteText(n));notify(t('copied'));}
      catch {notify(t('copyFailed'));}
    });
    element.querySelector('#share-note').addEventListener('click',()=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}
      // Web Share requires transient user activation; call it before awaiting DB operations.
      // The shared content is the current visible draft, without modifying the saved note.
      const text=plainNoteText(n);
      if(!text.trim())return;
      const copyFallback=async()=>{
        try{await navigator.clipboard.writeText(text);notify(t('notesShareCopied'));}
        catch{notify(t('copyFailed'));}
      };
      if(typeof navigator.share==='function'){
        try{
          navigator.share({text}).catch(err=>{if(err?.name!=='AbortError')void copyFallback();});
          return;
        }catch{ /* Unsupported share payload: try the clipboard. */ }
      }
      void copyFallback();
    });
    element.querySelector('#save-note-template').addEventListener('click',async event=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}
      if(templatesReadOnly){notify(t('notesTemplateCorrupt'));return;}
      if(templates.items.length>=MAX_NOTE_TEMPLATES){notify(t('notesTemplateLimit'));return;}
      const name=window.prompt(t('notesTemplateNamePrompt'),n.title.trim()||t(n.kind==='checklist'?'newChecklist':'newNote'));
      if(name===null)return;
      const button=event.currentTarget;
      button.disabled=true;
      try{
        const ok=await flush();
        if(!ok||dirty){notify(t('crossSaveFirst'));return;}
        const item=templateFromNote(n,{id:uid(),name,now:new Date().toISOString()});
        await updateTemplates(templateAdd(templates,item));
        if(disposed)return;
        notify(t('notesTemplateSaved'));
      }catch(err){
        if(!disposed)notify(err.message.includes('Invalid')?t('notesTemplateInvalid'):(err.message.includes('limit')?t('notesTemplateLimit'):t('notesTemplateError')));
        if(err?.code==='stale-meta'){
          try{const raw=await getMeta('notesTemplatesData');if(raw!==undefined&&!validNotesTemplates(raw))throw Error('Invalid');templatesBaseline=raw;templates=raw===undefined?emptyNotesTemplates():raw;}catch{templatesReadOnly=true;notify(t('notesTemplateCorrupt'));}
        }
      }finally{if(button.isConnected)button.disabled=false;}
    });
    element.querySelector('#duplicate-note').addEventListener('click',async()=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}
      await flush();
      if(dirty){notify(t('crossSaveFirst'));return;}
      if(notes.length>=MAX_NOTES){notify(t('notesLimit'));return;}
      try {
        const clone=duplicateNoteData(n,uid(),uid,new Date().toISOString(),t('notesCopySuffix'));
        await putNote(clone);notes.push(clone);editor(clone.id);notify(t('notesDuplicated'));
      }catch(err){notify(`${t('error')}: ${err.message}`);}
    });
    element.querySelector('#note-to-task').addEventListener('click',async()=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}
      await flush();
      if(dirty){notify(t('crossSaveFirst'));return;}
      onQuickDraft(draftTaskFromNote(n));
    });
    element.querySelector('#pin-note').addEventListener('click',event=>{
      n.pinned=!n.pinned;event.currentTarget.textContent='📌 '+t(n.pinned?'unpin':'pin');update();
    });
    element.querySelector('#star-note').addEventListener('click',event=>{
      n.favourite=!n.favourite;event.currentTarget.textContent=(n.favourite?'★ ':'☆ ')+t(n.favourite?'unfavourite':'favourite');update();
    });
    element.querySelector('#delete-note').addEventListener('click', async()=>{
      if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}
      if(!confirmAction(t('trashMoveConfirm'))) return;
      await flush();
      if(dirty){notify(t('notesSaveCannotLeave'));return;}
      try {
        await moveNoteToTrash(safeClone(n));
        notes=notes.filter(note=>note.id!==n.id);
        trash=await getNotesTrash();
        lastDeleted=n.id;
        list();
        notify(t('trashMoved'));
      }catch(err){notify(`${t('error')}: ${err.message}`);}
    });
    element.querySelector('#back-notes').addEventListener('click',async()=>{if(hasUnaddedChecklistInput()){notify(t('notesChecklistAddFirst'));return;}await flush();if(dirty){notify(t('notesSaveCannotLeave'));return;}list();});
    return recoveryMirrorOk;
  };
  const onVisibility = () => {if(document.hidden) void flush();};
  const onPageHide = () => { if(saveManager.state().dirty)void flush(); }; // best-effort only
  const onBeforeUnload = event => {
    if(!saveManager.state().dirty&&!hasUnaddedChecklistInput())return;
    event.preventDefault();
    event.returnValue=''; // browser may display a generic unsaved-changes dialog
  };
  const onSaveShortcut = event => {
    if(!currentId||!currentSaveNow||!element.contains(event.target)||!isNoteSaveShortcut(event))return;
    event.preventDefault();
    void currentSaveNow();
  };
  element.addEventListener('keydown',onSaveShortcut);
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',onPageHide);
  window.addEventListener('beforeunload',onBeforeUnload);
  list();
  if(initialId && notes.some(note=>note.id===initialId)) editor(initialId);
  const release=async () => {
    if(hasUnaddedChecklistInput())throw Error(t('notesChecklistAddFirst'));
    if(!(await flush()))throw Error(t('notesSaveCannotLeave'));
    disposed=true;
    element.removeEventListener('keydown',onSaveShortcut);
    lastDeleted=null;
    document.removeEventListener('visibilitychange',onVisibility);
    window.removeEventListener('pagehide',onPageHide);
    window.removeEventListener('beforeunload',onBeforeUnload);
  };
  release.getViewState=()=>{rememberTemplatePanel();return {search,scope,order,category:categoryFilter,limit:displayedLimit,templatePanelOpen,templateQuery};};
  return release;
}
