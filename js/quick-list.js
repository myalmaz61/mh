import {getMeta,setMetaIfUnchanged} from './db.js';
import {showMetaSaveError,mayLeaveAfterFailure} from './meta-save-core.js';
import {escapeHtml,uid} from './utils.js';
import {emptyQuickLists,validQuickListsData,quickProgress,MAX_QUICK_LISTS,MAX_QUICK_ITEMS} from './quick-list-core.js';

const now=()=>new Date().toISOString();
export async function mountQuickList({element,t,notify,confirmAction,initialId=null}){
  let savedSnapshot=await getMeta('quickListsData');
  let data=savedSnapshot===undefined?emptyQuickLists():savedSnapshot;
  if(!validQuickListsData(data)){
    element.innerHTML=`<section class="tool-head"><h1>${t('quickList')}</h1></section><section class="surface"><p class="warning-text">${t('quickCorrupt')}</p></section>`;
    return ()=>{};
  }
  let selected=data.lists.some(list=>list.id===initialId)?initialId:(data.lists[0]?.id||''),renameMode=false,busy=false,disposed=false;
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
       <div class="hub-actions"><button class="secondary-btn" type="button" data-quick-action="clear">${t('quickClearDone')}</button>
        <button class="danger-btn" type="button" data-quick-action="delete">${t('quickDeleteList')}</button></div>
       </section>`:''}
       <p class="muted hub-footer">${t('quickLocalHint')}</p>`;
  }
  async function persist(next,success){
    if(busy||!validQuickListsData(next)){notify(t('quickInvalid'));return false;}
    busy=true;
    try{await setMetaIfUnchanged('quickListsData',savedSnapshot,next);savedSnapshot=next;data=next;success?.();render();return true;}
    catch(err){console.error(err);showMetaSaveError(element,t,err);notify(t('quickSaveError'));return false;}
    finally{busy=false;}
  }
  const replaceList=(id,change)=>({schema:1,lists:data.lists.map(x=>x.id===id?change(x):x)});
  async function click(event){
    const button=event.target.closest('button');
    if(!button||!element.contains(button)||busy)return;
    if(!mayLeaveAfterFailure(element,t,confirmAction))return;
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
    else if(action==='clear'){
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
    if(!mayLeaveAfterFailure(element,t,confirmAction)){input.checked=list.items.find(x=>x.id===itemId).done;return;}
    const original=list.items.find(x=>x.id===itemId);
    const ok=await persist(replaceList(list.id,x=>({...x,updatedAt:now(),items:x.items.map(item=>item.id===itemId?{...item,done}:item)})),()=>notify(t('saved')));
    if(!ok && input.isConnected)input.checked=original.done;
  }
  async function submit(event){
    const form=event.target;
    if(!['quick-new-form','quick-add-item','quick-rename-form'].includes(form?.id))return;
    event.preventDefault();
    if(busy)return;
    const fd=new FormData(form);
    if(form.id==='quick-new-form'){
      if(data.lists.length>=MAX_QUICK_LISTS){notify(t('quickListLimit'));return;}
      const name=String(fd.get('name')||'').trim();
      if(!name||name.length>80){notify(t('quickInvalid'));return;}
      const stamp=now(),id=uid(),list={id,name,createdAt:stamp,updatedAt:stamp,items:[]};
      await persist({schema:1,lists:[...data.lists,list]},()=>{selected=id;notify(t('quickCreated'));});
    }else if(form.id==='quick-rename-form'){
      const list=chosen();if(!list)return;
      const name=String(fd.get('name')||'').trim();
      if(!name||name.length>80){notify(t('quickInvalid'));return;}
      await persist(replaceList(list.id,x=>({...x,name,updatedAt:now()})),()=>{renameMode=false;notify(t('saved'));});
    }else{
      const list=chosen();if(!list)return;
      if(list.items.length>=MAX_QUICK_ITEMS){notify(t('quickItemLimit'));return;}
      const text=String(fd.get('text')||'').trim();
      if(!text||text.length>250){notify(t('quickInvalid'));return;}
      await persist(replaceList(list.id,x=>({...x,items:[...x.items,{id:uid(),text,done:false}],updatedAt:now()})),()=>notify(t('quickAdded')));
      element.querySelector('#quick-item-text')?.focus();
    }
  }
  const onUnload=event=>{if(element.querySelector('[data-meta-save-warning]')){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',onUnload);
  element.addEventListener('click',click);
  element.addEventListener('change',change);
  element.addEventListener('submit',submit);
  render();
  return ()=>{if(!mayLeaveAfterFailure(element,t,confirmAction))return false;disposed=true;window.removeEventListener('beforeunload',onUnload);element.removeEventListener('click',click);
    element.removeEventListener('change',change);element.removeEventListener('submit',submit);};
}
