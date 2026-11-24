import {getMeta,setMetaIfUnchanged} from './db.js';
import {showMetaSaveError,mayLeaveAfterFailure} from './meta-save-core.js';
import {snapshotFormValues,hasOtherUnsavedForms,hasUnsavedFormChanges} from './unsaved-form-core.js';
import {createQuickRecoveryStore,quickDraftDestination,applyQuickDraftValue} from './quick-list-recovery-core.js';
import {escapeHtml,uid} from './utils.js';
import {emptyQuickLists,validQuickListsData,quickProgress,resetQuickTicks,duplicateQuickList,MAX_QUICK_LISTS,MAX_QUICK_ITEMS} from './quick-list-core.js';

const now=()=>new Date().toISOString();
export async function mountQuickList({element,t,notify,confirmAction,initialId=null}){
  let savedSnapshot=await getMeta('quickListsData');
  let data=savedSnapshot===undefined?emptyQuickLists():savedSnapshot;
  if(!validQuickListsData(data)){
    element.innerHTML=`<section class="tool-head"><h1>${t('quickList')}</h1></section><section class="surface"><p class="warning-text">${t('quickCorrupt')}</p></section>`;
    return ()=>{};
  }
  let selected=data.lists.some(list=>list.id===initialId)?initialId:(data.lists[0]?.id||''),renameMode=false,busy=false,disposed=false;
  const formIds=['quick-new-form','quick-add-item','quick-rename-form'];
  let formBaselines={};
  const recovery=createQuickRecoveryStore((()=>{try{return window.localStorage;}catch{return null;}})());
  const activeDraftKeys=new Map();
  let warnedStorage=false, pendingOrphanItem=null;
  function clearDraft(id){
    const key=activeDraftKeys.get(id);if(key)recovery.remove(key);
    activeDraftKeys.delete(id);
  }
  function clearOtherDrafts(exceptId=''){
    for(const id of [...activeDraftKeys.keys()])if(id!==exceptId)clearDraft(id);
    if(exceptId!=='quick-new-form')pendingOrphanItem=null;
  }
  function syncDraft(id){
    const form=element.querySelector('#'+id);
    if(!form)return false;
    if(!hasUnsavedFormChanges(form,formBaselines[id])){clearDraft(id);return true;}
    let key=activeDraftKeys.get(id);
    if(!key){key=recovery.makeKey(uid());activeDraftKeys.set(id,key);}
    const list=chosen(),isNew=id==='quick-new-form';
    const result=recovery.write(key,{formId:id,listId:isNew?null:list?.id||null,
      listName:isNew?'':list?.name||'',baselineName:isNew?'':list?.name||'',fields:snapshotFormValues(form)});
    if(!result.ok&&!warnedStorage){warnedStorage=true;notify(t('formRecoveryFailed'));}
    return result.ok;
  }
  function recoveryPanel(){
    const {drafts,corrupt}=recovery.list();
    const shown=drafts.filter(item=>item.key!==pendingOrphanItem?.key&&!([...activeDraftKeys.values()].includes(item.key)));
    if(!shown.length&&!corrupt)return '';
    return `<section class="surface form-recovery-panel"><h2>${t('formRecoveryTitle')}</h2>
      <p class="muted">${t('formRecoveryHint')}</p>${corrupt?`<p class="warning-text">${t('formRecoveryCorrupt')} (${corrupt})</p>`:''}
      ${shown.map(item=>{const kind=t(item.formId==='quick-add-item'?'quickRecoveryItem':item.formId==='quick-rename-form'?'quickRecoveryRename':'quickRecoveryNew');
        return `<div class="form-recovery-row"><strong>${escapeHtml(kind)}</strong>
          ${item.listName?`<small class="muted">${escapeHtml(item.listName)}</small>`:''}
          <p>${escapeHtml(item.fields[0][1].slice(0,120))}</p><div class="hub-actions">
          <button class="secondary-btn" type="button" data-quick-draft-restore="${escapeHtml(item.key)}">${t('formRecoveryRestore')}</button>
          <button class="secondary-btn" type="button" data-quick-draft-discard="${escapeHtml(item.key)}">${t('formRecoveryDiscard')}</button></div></div>`;}).join('')}
    </section>`;
  }
  const forms=()=>Object.fromEntries(formIds.map(id=>[id,element.querySelector('#'+id)]));
  const dirtyForms=exceptId=>hasOtherUnsavedForms(forms(),formBaselines,exceptId);
  const canDiscard=(exceptId='')=>{
    if(!mayLeaveAfterFailure(element,t,confirmAction))return false;
    if(dirtyForms(exceptId)){
      if(!confirmAction(t('unsavedFormConfirm')))return false;
      clearOtherDrafts(exceptId);
    }
    return true;
  };
  const chosen=()=>data.lists.find(x=>x.id===selected);
  function render(){
    if(disposed)return;
    const list=chosen();
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / CHECKLIST</span><h1>${t('quickList')}</h1><p>${t('quickIntro')}</p></section>
    <section class="surface hub-quick-panel"><h2>${t('quickMyLists')}</h2>
      <form id="quick-new-form" class="hub-inline-form"><label class="sr-only" for="quick-new-name">${t('quickName')}</label>
      <input id="quick-new-name" name="name" class="text-field" maxlength="80" required placeholder="${t('quickName')}" autocomplete="off">
      <button type="submit" class="primary-btn">+ ${t('add')}</button></form>
      <div class="hub-quick-tabs">${data.lists.map(row=>{const progress=quickProgress(row);return `<button type="button" class="${selected===row.id?'hub-selected':''}" aria-pressed="${selected===row.id}" data-quick-select="${row.id}"><strong>${escapeHtml(row.name)}</strong><small>${progress.done}/${progress.total}</small></button>`;}).join('')}</div>
      ${!data.lists.length?`<p class="hub-empty">${t('quickEmpty')}</p>`:''}</section>
      ${list?`<section class="surface hub-quick-panel"><div class="row-between hub-list-heading"><div><h2>${escapeHtml(list.name)}</h2>
       <p class="muted">${t('quickRemaining')}: ${quickProgress(list).remaining}</p></div>
       ${renameMode?'':`<button class="secondary-btn" type="button" data-quick-action="rename">${t('quickRename')}</button>`}</div>
       ${renameMode?`<form class="hub-inline-form" id="quick-rename-form"><label class="sr-only" for="quick-rename-name">${t('quickName')}</label><input id="quick-rename-name" name="name" class="text-field" maxlength="80" required value="${escapeHtml(list.name)}"><button class="primary-btn" type="submit">${t('taskSave')}</button><button class="secondary-btn" type="button" data-quick-action="cancel-rename">${t('cancel')}</button></form>`:''}
       <div class="hub-quick-items">${list.items.length?list.items.map(item=>`<div class="hub-quick-item">
         <label class="hub-quick-check"><input type="checkbox" data-quick-toggle="${item.id}" ${item.done?'checked':''}>
          <span class="${item.done?'hub-crossed':''}">${escapeHtml(item.text)}</span></label>
         <button class="hub-small-btn" type="button" data-quick-remove="${item.id}" aria-label="${t('deleteItem')} ${escapeHtml(item.text)}">×</button>
         </div>`).join(''):`<p class="muted">${t('quickNoItems')}</p>`}</div>
       <form id="quick-add-item" class="hub-inline-form"><label for="quick-item-text" class="sr-only">${t('quickAddItem')}</label>
        <input id="quick-item-text" name="text" class="text-field" maxlength="250" required placeholder="${t('quickAddItem')}" autocomplete="off">
        <button type="submit" class="primary-btn">+ ${t('add')}</button></form>
       <div class="hub-actions"><button class="secondary-btn" type="button" data-quick-action="reset">${t('quickResetTicks')}</button>
        <button class="secondary-btn" type="button" data-quick-action="duplicate">${t('quickDuplicate')}</button>
        <button class="secondary-btn" type="button" data-quick-action="clear">${t('quickClearDone')}</button>
        <button class="danger-btn" type="button" data-quick-action="delete">${t('quickDeleteList')}</button></div>
       </section>`:''}
       ${recoveryPanel()}<p class="muted hub-footer">${t('quickLocalHint')}</p>`;
    formBaselines=Object.fromEntries(formIds.map(id=>[id,snapshotFormValues(element.querySelector('#'+id))]));
  }
  async function persist(next,success){
    if(busy||!validQuickListsData(next)){notify(t('quickInvalid'));return false;}
    busy=true;
    // While an IndexedDB transaction is in progress, prevent new typing that
    // would otherwise be erased by the successful re-render.
    const editingFields=[...element.querySelectorAll('#quick-new-form input,#quick-add-item input,#quick-rename-form input')];
    for(const field of editingFields)field.disabled=true;
    try{await setMetaIfUnchanged('quickListsData',savedSnapshot,next);savedSnapshot=next;data=next;success?.();render();return true;}
    catch(err){console.error(err);showMetaSaveError(element,t,err);notify(t('quickSaveError'));return false;}
    finally{busy=false;for(const field of editingFields)if(field.isConnected)field.disabled=false;}
  }
  const replaceList=(id,change)=>({schema:1,lists:data.lists.map(x=>x.id===id?change(x):x)});
  async function click(event){
    const button=event.target.closest('button');
    if(!button||!element.contains(button)||busy)return;
    if(button.type==='submit')return; // The submit handler guards the other forms.
    const draftKey=button.dataset.quickDraftRestore||button.dataset.quickDraftDiscard;
    if(draftKey){
      const candidate=recovery.read(draftKey);if(!candidate)return;
      if(button.dataset.quickDraftDiscard){
        if(!confirmAction(t('formRecoveryDiscardConfirm')))return;
        if(recovery.removeIfUnchanged(draftKey,candidate.raw)){
          button.closest('.form-recovery-row')?.remove();
          const panel=element.querySelector('.form-recovery-panel');
          if(panel&&!panel.querySelector('.form-recovery-row')&&!panel.querySelector('.warning-text'))panel.remove();
        }
        return;
      }
      if(!canDiscard())return;
      const destination=quickDraftDestination(candidate,data.lists);
      if(destination.mode==='invalid')return;
      clearOtherDrafts();pendingOrphanItem=null;
      let targetForm='quick-new-form';
      if(destination.mode==='item'){
        selected=destination.listId;renameMode=false;targetForm='quick-add-item';
      }else if(destination.mode==='rename'){
        selected=destination.listId;renameMode=true;targetForm='quick-rename-form';
      }else if(destination.mode==='new-list'&&candidate.formId==='quick-add-item'){
        // The original list was deleted. On Save we create a new list with this
        // recovered item. Preserve the source draft until that save succeeds.
        pendingOrphanItem={key:draftKey,raw:candidate.raw,text:candidate.fields[0][1]};
      }
      render();
      const form=element.querySelector('#'+targetForm);
      if(pendingOrphanItem){
        const input=form?.querySelector('[name="name"]');if(input)input.value=candidate.listName;
      }else if(targetForm===candidate.formId){
        applyQuickDraftValue(form,candidate);
      }else{
        const input=form?.querySelector('[name="name"]');if(input)input.value=candidate.fields[0][1];
      }
      const copied=syncDraft(targetForm);
      if(copied&&!pendingOrphanItem)recovery.removeIfUnchanged(draftKey,candidate.raw);
      notify(destination.mode==='new-list'?t('quickRecoverySeparate'):t('formRecoveryRestored'));
      element.querySelector('#'+targetForm+' input')?.focus();
      // render() replaced the old DOM; remove the corresponding row in the
      // CURRENT panel too, so a successfully restored draft is not offered twice.
      for(const restoredButton of element.querySelectorAll('[data-quick-draft-restore]')){
        if(restoredButton.dataset.quickDraftRestore===draftKey)restoredButton.closest('.form-recovery-row')?.remove();
      }
      const panel=element.querySelector('.form-recovery-panel');
      if(panel&&!panel.querySelector('.form-recovery-row')&&!panel.querySelector('.warning-text'))panel.remove();
      return;
    }
    if(!canDiscard())return;
    if(button.dataset.quickSelect){selected=button.dataset.quickSelect;renameMode=false;render();return;}
    const list=chosen();if(!list)return;
    const remove=button.dataset.quickRemove;
    if(remove){
      if(!list.items.some(x=>x.id===remove))return;
      await persist(replaceList(list.id,x=>({...x,updatedAt:now(),items:x.items.filter(i=>i.id!==remove)})),()=>notify(t('saved')));
      return;
    }
    const action=button.dataset.quickAction;
    if(action==='rename'){renameMode=true;render();element.querySelector('#quick-rename-name')?.focus();}
    else if(action==='cancel-rename'){renameMode=false;render();}
    else if(action==='reset'){
      if(!list.items.some(item=>item.done)){notify(t('quickNothingToReset'));return;}
      if(!confirmAction(t('quickResetConfirm')))return;
      await persist(replaceList(list.id,x=>resetQuickTicks(x,now())),()=>notify(t('quickTicksReset')));
    }else if(action==='duplicate'){
      if(data.lists.length>=MAX_QUICK_LISTS){notify(t('quickListLimit'));return;}
      const suffix=` (${t('quickCopySuffix')})`;
      const stamp=now(),id=uid();
      const copy=duplicateQuickList(list,{id,itemIds:list.items.map(()=>uid()),name:list.name.slice(0,80-suffix.length)+suffix,stamp});
      await persist({schema:1,lists:[...data.lists,copy]},()=>{selected=id;renameMode=false;notify(t('quickCopied'));});
    }else if(action==='clear'){
      if(!list.items.some(x=>x.done)){notify(t('quickNothingToClear'));return;}
      if(!confirmAction(t('quickClearConfirm')))return;
      await persist(replaceList(list.id,x=>({...x,items:x.items.filter(i=>!i.done),updatedAt:now()})),()=>notify(t('saved')));
    }else if(action==='delete'){
      if(!confirmAction(t('quickDeleteConfirm')))return;
      await persist({schema:1,lists:data.lists.filter(x=>x.id!==list.id)},()=>{selected=data.lists.find(x=>x.id!==list.id)?.id||'';notify(t('quickDeleted'));});
    }
  }
  async function change(event){
    const input=event.target.closest('[data-quick-toggle]');
    if(!input||!element.contains(input)||busy)return;
    const list=chosen();if(!list||!list.items.some(x=>x.id===input.dataset.quickToggle))return;
    const itemId=input.dataset.quickToggle,done=input.checked;
    if(!canDiscard()){input.checked=list.items.find(x=>x.id===itemId).done;return;}
    const original=list.items.find(x=>x.id===itemId);
    const ok=await persist(replaceList(list.id,x=>({...x,updatedAt:now(),items:x.items.map(item=>item.id===itemId?{...item,done}:item)})),()=>notify(t('saved')));
    if(!ok && input.isConnected)input.checked=original.done;
  }
  async function submit(event){
    const form=event.target;
    if(!['quick-new-form','quick-add-item','quick-rename-form'].includes(form?.id))return;
    event.preventDefault();
    if(busy || !canDiscard(form.id))return;
    const fd=new FormData(form);
    if(form.id==='quick-new-form'){
      if(data.lists.length>=MAX_QUICK_LISTS){notify(t('quickListLimit'));return;}
      const name=String(fd.get('name')||'').trim();
      if(!name||name.length>80){notify(t('quickInvalid'));return;}
      const stamp=now(),id=uid(),list={id,name,createdAt:stamp,updatedAt:stamp,items:[]};
      if(pendingOrphanItem){
        const text=pendingOrphanItem.text.trim();
        if(!text||text.length>250){notify(t('quickInvalid'));return;}
        list.items.push({id:uid(),text,done:false});
      }
      await persist({schema:1,lists:[...data.lists,list]},()=>{
        clearDraft(form.id);
        if(pendingOrphanItem)recovery.removeIfUnchanged(pendingOrphanItem.key,pendingOrphanItem.raw);
        pendingOrphanItem=null;selected=id;notify(t('quickCreated'));
      });
    }else if(form.id==='quick-rename-form'){
      const list=chosen();if(!list)return;
      const name=String(fd.get('name')||'').trim();
      if(!name||name.length>80){notify(t('quickInvalid'));return;}
      await persist(replaceList(list.id,x=>({...x,name,updatedAt:now()})),()=>{clearDraft(form.id);renameMode=false;notify(t('saved'));});
    }else{
      const list=chosen();if(!list)return;
      if(list.items.length>=MAX_QUICK_ITEMS){notify(t('quickItemLimit'));return;}
      const text=String(fd.get('text')||'').trim();
      if(!text||text.length>250){notify(t('quickInvalid'));return;}
      await persist(replaceList(list.id,x=>({...x,items:[...x.items,{id:uid(),text,done:false}],updatedAt:now()})),()=>{clearDraft(form.id);notify(t('quickAdded'));});
      element.querySelector('#quick-item-text')?.focus();
    }
  }
  const onInput=event=>{
    const form=event.target?.closest?.('form');
    if(form&&formIds.includes(form.id))syncDraft(form.id);
  };
  const onUnload=event=>{if(dirtyForms() || element.querySelector('[data-meta-save-warning]')){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',onUnload);
  element.addEventListener('input',onInput);
  element.addEventListener('click',click);
  element.addEventListener('change',change);
  element.addEventListener('submit',submit);
  render();
  return ()=>{if(busy || !canDiscard())return false;disposed=true;window.removeEventListener('beforeunload',onUnload);element.removeEventListener('input',onInput);element.removeEventListener('click',click);
    element.removeEventListener('change',change);element.removeEventListener('submit',submit);};
}
