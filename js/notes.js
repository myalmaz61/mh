import { getNotes, putNote, moveNoteToTrash, getNotesTrash, restoreTrashedNote, purgeTrashedNote, emptyNotesTrashForever, changeNotesCategories } from './db.js';
import { escapeHtml, makeNote, uid, safeClone } from './utils.js';
import { MAX_NOTES } from './config.js';
import { draftTaskFromNote } from './cross-actions-core.js';
import { plainNoteText, duplicateNoteData } from './note-actions-core.js';
import { selectNotes } from './notes-view-core.js';
import { categoryName, noteCategories } from './notes-category-core.js';
import { MAX_BULK_NOTES } from './notes-bulk-core.js';
import { parseChecklistBatch, setChecklistCompletion, checklistProgress, moveChecklistRow } from './notes-checklist-core.js';

export async function mountNotes({ element, t, lang, confirmAction, notify, initialId=null, onQuickDraft=()=>{} }) {
  const stored = await getNotes();
  const valid = note => note && typeof note.id === 'string' && ['text','checklist'].includes(note.kind) &&
    typeof note.title === 'string' && typeof note.body === 'string' && Array.isArray(note.items) &&
    note.items.every(item => item && typeof item.text === 'string' && typeof item.done === 'boolean') &&
    typeof note.updatedAt === 'string' && Number.isFinite(Date.parse(note.updatedAt)) &&
    (note.category===undefined || (typeof note.category==='string' && note.category.length<=40 && !/[\u0000-\u001f\u007f]/.test(note.category)));
  let notes = stored.filter(valid);
  let trash;
  try { trash = await getNotesTrash(); } catch { trash = null; notify(t('trashCorrupt')); }
  if(notes.length !== stored.length) notify(t('corruptRecords'));
  let currentId = null;
  let search = '';
  let scope = 'all';
  let order = 'newest';
  let categoryFilter = '*';
  let bulkMode = false;
  const selectedIds = new Set();
  let timer = null;
  let dirty = false;
  let lastDeleted = null; // quick Undo stays temporary; the Trash itself persists
  let queue = Promise.resolve();
  let disposed = false;
  const locale = lang === 'en' ? 'en-GB' : 'bg-BG';
  const current = () => notes.find(n=>n.id===currentId);
  const safePersist = snapshot => {
    queue = queue.then(() => putNote(snapshot));
    // A rejected write is signalled, not swallowed silently. Continue for future saves.
    const task = queue;
    queue = queue.catch(err => { notify(`${t('error')}: ${err.message}`); });
    return task;
  };
  const flush = async () => {
    if (timer) { clearTimeout(timer); timer=null; }
    if (dirty && current()) {
      dirty=false;
      const snapshot=safeClone(current());
      const task=safePersist(snapshot);
      try { await task; }
      catch { dirty=true; }
    }
    await queue;
    if (!disposed && currentId) {
      const status=element.querySelector('#note-status');
      if(status) status.textContent=dirty ? t('saving') : t('saved');
    }
  };
  const schedule = () => {
    dirty=true;
    const status=element.querySelector('#note-status');
    if(status) status.textContent=t('saving');
    if(timer) clearTimeout(timer);
    timer=setTimeout(()=>{ void flush(); },350);
  };
  const list = () => {
    currentId=null;
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
      ${lastDeleted ? `<div class="notes-undo" role="status"><span>${t('notesDeletedUndo')}</span><button type="button" class="secondary-btn" id="undo-delete-note">${t('notesUndo')}</button></div>` : ''}
      <div id="notes-list" class="notes-grid"></div>`;
    const searchInput=element.querySelector('#note-search');
    const resultList=element.querySelector('#notes-list');
    const scopeInput=element.querySelector('#note-scope');
    const orderInput=element.querySelector('#note-order');
    const categoryInput=element.querySelector('#note-category-filter');
    scopeInput.value=scope;orderInput.value=order;
    if(categoryFilter!=='*' && categoryFilter!=='' && !noteCategories(notes,locale).some(c=>c.toLocaleLowerCase()===categoryFilter.toLocaleLowerCase()))categoryFilter='*';
    if(categoryInput)categoryInput.value=categoryFilter;
    const renderList=() => {
      const visible=selectNotes(notes,{query:search,scope,order,locale,category:categoryFilter});
      element.querySelector('#notes-count').textContent=t('notesCount').replace('{shown}',String(visible.length)).replace('{total}',String(notes.length));
      resultList.innerHTML=visible.length ? visible.map(n => {
        const summary=n.kind==='checklist' ? `${n.items.filter(i=>i.done).length}/${n.items.length} ✓ · ${n.items.slice(0,2).map(i=>i.text).join(', ')}` : n.body.slice(0,110);
        const label=n.title.trim() || (n.kind==='checklist' ? t('newChecklist') : t('newNote'));
        const content=`<div class="row-between"><span class="note-type">${n.kind==='checklist'?'☑':'✎'} ${n.kind==='checklist' ? t('newChecklist') : t('newNote')}</span><span>${n.pinned?'📌 ':''}${n.favourite?'★':''}</span></div>
          <strong>${escapeHtml(label)}</strong>${categoryName(n.category) ? `<span class="note-category-chip">${escapeHtml(categoryName(n.category))}</span>` : ''}<span class="note-preview">${escapeHtml(summary) || '—'}</span>
          <small>${new Intl.DateTimeFormat(locale,{day:'numeric',month:'short'}).format(new Date(n.updatedAt))}</small>`;
        return bulkMode ? `<label class="note-card notes-select-card"><span class="notes-select-control"><input type="checkbox" data-select-note="${escapeHtml(n.id)}" ${selectedIds.has(n.id)?'checked':''}><span>${t('notesBulkSelect')}</span></span>${content}</label>`
          : `<button class="note-card" type="button" data-note-id="${escapeHtml(n.id)}">${content}</button>`;
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
    searchInput.addEventListener('input', () => {search=searchInput.value;selectedIds.clear();renderList();});
    scopeInput.addEventListener('change',()=>{scope=scopeInput.value;selectedIds.clear();renderList();});
    orderInput.addEventListener('change',()=>{order=orderInput.value;renderList();});
    categoryInput?.addEventListener('change',()=>{categoryFilter=categoryInput.value;selectedIds.clear();renderList();});
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
        const visible=selectNotes(notes,{query:search,scope,order,locale,category:categoryFilter});
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
    resultList.addEventListener('click',event=>{
      const btn=event.target.closest('[data-note-id]');
      if(btn && !bulkMode) editor(btn.dataset.noteId);
    });
    renderList();
  };
  // Trash is an explicit, independent view. No autosave in it, and no
  // automatic permanent deletion, expiration or pruning.
  const trashList = () => {
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
  const editor = id => {
    currentId=id;
    const n=current();
    if(!n){list();return;}
    element.innerHTML=`<div class="editor-top"><button class="back-btn" type="button" id="back-notes">‹ ${t('backToNotes')}</button><span class="save-status" id="note-status">${t('saved')}</span></div>
      <article class="surface note-editor"><input class="note-title-input" id="note-title" maxlength="200" placeholder="${t('titlePlaceholder')}" value="${escapeHtml(n.title)}" aria-label="${t('titlePlaceholder')}">
      <label class="note-category-editor" for="note-category">${t('notesCategory')} <small>(${t('notesOptional')})</small><input class="text-field" id="note-category" type="text" maxlength="40" list="note-category-suggestions" autocomplete="off" placeholder="${t('notesCategoryPlaceholder')}" value="${escapeHtml(n.category || '')}"></label>
      <datalist id="note-category-suggestions">${noteCategories(notes,locale).map(c=>`<option value="${escapeHtml(c)}"></option>`).join('')}</datalist>
      ${n.kind==='text' ? `<textarea id="note-body" maxlength="100000" rows="11" class="note-body" placeholder="${t('textPlaceholder')}" aria-label="${t('textPlaceholder')}">${escapeHtml(n.body)}</textarea>` :
      `<div class="checklist-tools"><span id="checklist-progress" class="muted" aria-live="polite"></span><div class="checklist-tool-buttons"><button type="button" class="secondary-btn" id="check-all">${t('checklistCheckAll')}</button><button type="button" class="secondary-btn" id="uncheck-all">${t('checklistUncheckAll')}</button><button type="button" class="secondary-btn" id="toggle-done-visibility" aria-pressed="false">${t('checklistHideDone')}</button></div></div><div id="checklist-items" class="checklist-items"></div><div class="form-row"><input class="text-field" id="new-item" maxlength="2000" placeholder="${t('checklistPlaceholder')}"><button type="button" class="primary-btn" id="add-item">+ ${t('add')}</button></div><details class="checklist-bulk"><summary>${t('checklistMultiAdd')}</summary><label for="checklist-paste">${t('checklistPasteHint')}</label><textarea id="checklist-paste" class="text-field" rows="4" placeholder="${t('checklistPastePlaceholder')}"></textarea><button type="button" class="secondary-btn" id="add-many-items">${t('checklistAddMany')}</button></details>`}
      <div class="editor-actions"><button type="button" class="secondary-btn" id="copy-note">⧉ ${t('copy')}</button><button type="button" class="secondary-btn" id="duplicate-note">${t('notesDuplicate')}</button><button type="button" class="secondary-btn" id="share-note">${t('notesShare')}</button><button type="button" class="secondary-btn cross-shortcut" id="note-to-task">${t('crossToTask')}</button><button type="button" class="secondary-btn" id="pin-note">${n.pinned?'📌 '+t('unpin'):'📌 '+t('pin')}</button>
      <button type="button" class="secondary-btn" id="star-note">${n.favourite?'★ '+t('unfavourite'):'☆ '+t('favourite')}</button>
      <button type="button" class="danger-btn" id="delete-note">${t('delete')}</button></div></article>`;
    const update = () => {n.updatedAt=new Date().toISOString();schedule();};
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
      const addItem=()=>{
        const text=itemInput.value.trim();
        if(!text || n.items.length>=300) return;
        n.items.push({id:uid(), text, done:false});
        itemInput.value='';update();renderItems();itemInput.focus();
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
        n.items.push(...rows);field.value='';update();renderItems();
        notify(t('checklistAdded').replace('{n}',String(rows.length)));
      });
      renderItems();
    }
    element.querySelector('#copy-note').addEventListener('click',async()=>{
      await flush();
      if(dirty){notify(t('crossSaveFirst'));return;}
      try {await navigator.clipboard.writeText(plainNoteText(n));notify(t('copied'));}
      catch {notify(t('copyFailed'));}
    });
    element.querySelector('#share-note').addEventListener('click',()=>{
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
    element.querySelector('#duplicate-note').addEventListener('click',async()=>{
      await flush();
      if(dirty){notify(t('crossSaveFirst'));return;}
      if(notes.length>=MAX_NOTES){notify(t('notesLimit'));return;}
      try {
        const clone=duplicateNoteData(n,uid(),uid,new Date().toISOString(),t('notesCopySuffix'));
        await putNote(clone);notes.push(clone);editor(clone.id);notify(t('notesDuplicated'));
      }catch(err){notify(`${t('error')}: ${err.message}`);}
    });
    element.querySelector('#note-to-task').addEventListener('click',async()=>{
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
      if(!confirmAction(t('trashMoveConfirm'))) return;
      await flush();
      try {
        await moveNoteToTrash(safeClone(n));
        notes=notes.filter(note=>note.id!==n.id);
        trash=await getNotesTrash();
        lastDeleted=n.id;
        list();
        notify(t('trashMoved'));
      }catch(err){notify(`${t('error')}: ${err.message}`);}
    });
    element.querySelector('#back-notes').addEventListener('click',async()=>{await flush();list();});
  };
  const onVisibility = () => {if(document.hidden) void flush();};
  document.addEventListener('visibilitychange',onVisibility);
  list();
  if(initialId && notes.some(note=>note.id===initialId)) editor(initialId);
  return async () => {
    await flush();
    disposed=true;
    lastDeleted=null;
    document.removeEventListener('visibilitychange',onVisibility);
  };
}
