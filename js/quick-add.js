import { getNotes, putNote, appendQuickTask } from './db.js';
import { MAX_NOTES } from './config.js';
import { buildQuickTask, buildQuickNote } from './quick-add-core.js';

/** Scoped Quick Add. Visible only on Home/Tools, never on editing screens. */
export function mountQuickAdd({element,t,notify,openRecord}) {
  element.insertAdjacentHTML('beforeend', `
    <button type="button" id="quick-add-launch" class="quick-add-fab" hidden aria-haspopup="dialog" aria-controls="quick-add-dialog" aria-label="${t('quickAdd')}" title="${t('quickAdd')}">+</button>
    <dialog id="quick-add-dialog" class="quick-add-dialog" aria-labelledby="quick-add-heading">
      <div class="quick-add-head"><div><h2 id="quick-add-heading">${t('quickAdd')}</h2><p>${t('quickAddHint')}</p></div>
        <button class="quick-add-close" type="button" data-quick-close aria-label="${t('cancel')}">×</button></div>
      <div class="quick-add-types" role="group" aria-label="${t('quickAdd')}">
        <button type="button" data-quick-kind="task" aria-pressed="true">✓ ${t('quickAddTask')}</button>
        <button type="button" data-quick-kind="note" aria-pressed="false">✎ ${t('quickAddNote')}</button>
      </div>
      <form id="quick-add-form">
        <label for="quick-add-title">${t('quickAddTitle')}</label>
        <input class="text-field" id="quick-add-title" name="title" required maxlength="140" autocomplete="off">
        <label for="quick-add-details" id="quick-add-details-label">${t('quickAddBody')}</label>
        <textarea class="text-field" id="quick-add-details" name="details" maxlength="2000" rows="3"></textarea>
        <div id="quick-add-task-fields" class="quick-add-task-fields">
          <label for="quick-add-due">${t('quickAddDue')}</label>
          <input class="text-field" id="quick-add-due" name="due" type="date" min="1900-01-01" max="2100-12-31">
          <label class="quick-add-check"><input id="quick-add-high" type="checkbox" name="high"> ${t('quickAddHigh')}</label>
        </div>
        <div class="quick-add-actions"><button type="button" class="secondary-btn" data-quick-close>${t('cancel')}</button>
          <button type="submit" id="quick-add-submit" class="primary-btn">${t('quickAddSave')}</button></div>
      </form>
    </dialog>`);
  const launch=element.querySelector('#quick-add-launch');
  const dialog=element.querySelector('#quick-add-dialog');
  const form=element.querySelector('#quick-add-form');
  const title=dialog.querySelector('#quick-add-title');
  const details=dialog.querySelector('#quick-add-details');
  const due=dialog.querySelector('#quick-add-due');
  const high=dialog.querySelector('#quick-add-high');
  const taskFields=dialog.querySelector('#quick-add-task-fields');
  const submit=dialog.querySelector('#quick-add-submit');
  let kind='task', saving=false;
  const hasDraft=()=>Boolean(title.value.trim()||details.value.trim()||due.value||high.checked);
  function setKind(value){
    if(saving)return;
    kind=value;
    dialog.querySelectorAll('[data-quick-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.quickKind===kind)));
    taskFields.hidden=(kind==='note');
    title.maxLength=kind==='task'?140:200;
    details.maxLength=kind==='task'?2000:100000;
  }
  function reset(){form.reset();setKind('task');}
  function close(){
    if(saving)return;
    if(hasDraft()&&!window.confirm(t('quickAddDiscard')))return;
    dialog.close();reset();
  }
  function onCancel(event){
    if(saving || (hasDraft()&&!window.confirm(t('quickAddDiscard'))))event.preventDefault();
    else reset();
  }
  function open(){
    if(dialog.open || saving)return;
    reset();dialog.showModal();title.focus();
  }
  async function save(event){
    event.preventDefault();
    if(saving)return;
    saving=true;submit.disabled=true;
    try{
      let record;
      if(kind==='task') {
        record=buildQuickTask({title:title.value,details:details.value,due:due.value,high:high.checked});
        await appendQuickTask(record);
      } else {
        record=buildQuickNote({title:title.value,body:details.value});
        const notes=await getNotes();
        if(notes.length>=MAX_NOTES)throw Error('limit');
        await putNote(record);
      }
      const route=kind==='task'?'tasks':'notes';
      dialog.close();reset();notify(t('saved'));openRecord(route,{id:record.id});
    }catch(err){
      console.error('Quick Add',err);
      const key=err.message==='limit'?'quickAddLimit':err.message==='corrupt'?'quickAddCorrupt':
        /^Invalid quick/.test(err.message)?'quickAddInvalid':'quickAddFailed';
      notify(t(key));
    }finally{saving=false;submit.disabled=false;}
  }
  launch.addEventListener('click',open);
  form.addEventListener('submit',save);
  dialog.querySelectorAll('[data-quick-kind]').forEach(button=>button.addEventListener('click',()=>setKind(button.dataset.quickKind)));
  dialog.querySelectorAll('[data-quick-close]').forEach(button=>button.addEventListener('click',close));
  dialog.addEventListener('cancel',onCancel);
  return {
    setVisible(route){launch.hidden=!['home','tools'].includes(route);},
    dispose(){if(dialog.open)dialog.close();launch.remove();dialog.remove();}
  };
}
