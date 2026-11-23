import { getNotes, putNote, deleteNote } from './db.js';
import { escapeHtml, makeNote, uid, safeClone } from './utils.js';
import { MAX_NOTES } from './config.js';
import { draftTaskFromNote } from './cross-actions-core.js';
import { plainNoteText, duplicateNoteData } from './note-actions-core.js';

export async function mountNotes({ element, t, lang, confirmAction, notify, initialId=null, onQuickDraft=()=>{} }) {
  const stored = await getNotes();
  const valid = note => note && typeof note.id === 'string' && ['text','checklist'].includes(note.kind) &&
    typeof note.title === 'string' && typeof note.body === 'string' && Array.isArray(note.items) &&
    note.items.every(item => item && typeof item.text === 'string' && typeof item.done === 'boolean') &&
    typeof note.updatedAt === 'string' && Number.isFinite(Date.parse(note.updatedAt));
  let notes = stored.filter(valid);
  if(notes.length !== stored.length) notify(t('corruptRecords'));
  let currentId = null;
  let search = '';
  let timer = null;
  let dirty = false;
  let queue = Promise.resolve();
  let disposed = false;
  const locale = lang === 'en' ? 'en-GB' : 'bg-BG';
  const sortNotes = (a,b) => Number(b.pinned)-Number(a.pinned) || Date.parse(b.updatedAt)-Date.parse(a.updatedAt);
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
      <div class="notes-actions"><button class="primary-btn" id="create-text">+ ${t('newNote')}</button><button class="secondary-btn" id="create-checklist">☑ ${t('newChecklist')}</button></div></div>
      <div id="notes-list" class="notes-grid"></div>`;
    const searchInput=element.querySelector('#note-search');
    const resultList=element.querySelector('#notes-list');
    const renderList=() => {
      const q=search.toLocaleLowerCase();
      const visible=notes.filter(n => [n.title,n.body,...n.items.map(i=>i.text)].join(' ').toLocaleLowerCase().includes(q)).sort(sortNotes);
      resultList.innerHTML=visible.length ? visible.map(n => {
        const summary=n.kind==='checklist' ? `${n.items.filter(i=>i.done).length}/${n.items.length} ✓ · ${n.items.slice(0,2).map(i=>i.text).join(', ')}` : n.body.slice(0,110);
        const label=n.title.trim() || (n.kind==='checklist' ? t('newChecklist') : t('newNote'));
        return `<button class="note-card" type="button" data-note-id="${escapeHtml(n.id)}"><div class="row-between"><span class="note-type">${n.kind==='checklist'?'☑':'✎'} ${n.kind==='checklist' ? t('newChecklist') : t('newNote')}</span><span>${n.pinned?'📌 ':''}${n.favourite?'★':''}</span></div>
          <strong>${escapeHtml(label)}</strong><span class="note-preview">${escapeHtml(summary) || '—'}</span>
          <small>${new Intl.DateTimeFormat(locale,{day:'numeric',month:'short'}).format(new Date(n.updatedAt))}</small></button>`;
      }).join('') : `<div class="empty-state">${search ? t('notesNoResults') : t('notesEmpty')}</div>`;
    };
    searchInput.addEventListener('input', () => {search=searchInput.value; renderList();});
    element.querySelector('#create-text').addEventListener('click',()=>{void create('text');});
    element.querySelector('#create-checklist').addEventListener('click',()=>{void create('checklist');});
    resultList.addEventListener('click',event=>{
      const btn=event.target.closest('[data-note-id]');
      if(btn) editor(btn.dataset.noteId);
    });
    renderList();
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
      ${n.kind==='text' ? `<textarea id="note-body" maxlength="100000" rows="11" class="note-body" placeholder="${t('textPlaceholder')}" aria-label="${t('textPlaceholder')}">${escapeHtml(n.body)}</textarea>` :
      `<div id="checklist-items" class="checklist-items"></div><div class="form-row"><input class="text-field" id="new-item" maxlength="2000" placeholder="${t('checklistPlaceholder')}"><button type="button" class="primary-btn" id="add-item">+ ${t('add')}</button></div>`}
      <div class="editor-actions"><button type="button" class="secondary-btn" id="copy-note">⧉ ${t('copy')}</button><button type="button" class="secondary-btn" id="duplicate-note">${t('notesDuplicate')}</button><button type="button" class="secondary-btn cross-shortcut" id="note-to-task">${t('crossToTask')}</button><button type="button" class="secondary-btn" id="pin-note">${n.pinned?'📌 '+t('unpin'):'📌 '+t('pin')}</button>
      <button type="button" class="secondary-btn" id="star-note">${n.favourite?'★ '+t('unfavourite'):'☆ '+t('favourite')}</button>
      <button type="button" class="danger-btn" id="delete-note">${t('delete')}</button></div></article>`;
    const update = () => {n.updatedAt=new Date().toISOString();schedule();};
    const title=element.querySelector('#note-title');
    title.addEventListener('input',()=>{n.title=title.value;update();});
    const body=element.querySelector('#note-body');
    if(body) body.addEventListener('input',()=>{n.body=body.value;update();});
    const checklist=element.querySelector('#checklist-items');
    if(checklist){
      const renderItems=()=>{
        checklist.innerHTML=n.items.map((item,index)=>`<div class="checklist-row"><label class="check-row-label"><input type="checkbox" data-done="${index}" ${item.done?'checked':''} aria-label="${t('done')}"><span></span></label>
          <input class="check-text" maxlength="2000" data-item-text="${index}" value="${escapeHtml(item.text)}" aria-label="${t('checklistPlaceholder')}">
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
          if(n.items[idx]){n.items[idx].done=event.target.checked;update();}
        }
      });
      checklist.addEventListener('click',event=>{
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
      renderItems();
    }
    element.querySelector('#copy-note').addEventListener('click',async()=>{
      await flush();
      if(dirty){notify(t('crossSaveFirst'));return;}
      try {await navigator.clipboard.writeText(plainNoteText(n));notify(t('copied'));}
      catch {notify(t('copyFailed'));}
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
      if(!confirmAction(t('deleteConfirm'))) return;
      await flush();
      try { await deleteNote(n.id); notes=notes.filter(note=>note.id!==n.id);list(); }
      catch(err){notify(`${t('error')}: ${err.message}`);}
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
    document.removeEventListener('visibilitychange',onVisibility);
  };
}
