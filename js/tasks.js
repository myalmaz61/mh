import { getMeta, setMeta } from './db.js';
import { escapeHtml, uid } from './utils.js';
import { parseYmd, todayLocal } from './calendar-core.js';
import { emptyTasks, validTask, validTasksData, filteredTasks, taskCounts, MAX_TASKS } from './tasks-core.js';
import { draftEventFromTask } from './cross-actions-core.js';

const isoNow=()=>new Date().toISOString();
const dateLabel=(ymd,lang)=>{
  const p=parseYmd(ymd);
  return p?new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
    .format(new Date(Date.UTC(p.year,p.month-1,p.day))):ymd;
};

/** Mount Tasks. No migrations or extra IDB stores needed. */
export async function mountTasks({element,t,lang,notify,confirmAction,initialId=null,onQuickDraft=()=>{}}){
  let data=await getMeta('tasksData');
  if(data===undefined)data=emptyTasks();
  if(!validTasksData(data)){
    element.innerHTML=`<section class="tool-head"><h1>${t('tasks')}</h1></section><section class="surface"><p class="warning-text">${t('taskCorrupt')}</p></section>`;
    return ()=>{}; // Keep damaged records intact; never save over them.
  }
  let filter='open',search='',editId=null,formOpen=false,busy=false,disposed=false;
  if(initialId && data.tasks.some(task=>task.id===initialId)){filter='all';editId=initialId;formOpen=true;}

  const cards=()=>{
    const shown=filteredTasks(data.tasks,{filter,search,today:todayLocal()});
    if(!shown.length)return `<div class="hub-empty">${t(search?'taskNoMatch':'taskEmpty')}</div>`;
    return shown.map(task=>{
      const overdue=!task.done && task.due!=='' && task.due<todayLocal();
      return `<article class="hub-task ${task.done?'hub-task-done':''}">
        <label class="hub-check-label"><input type="checkbox" data-task-toggle="${task.id}" ${task.done?'checked':''} aria-label="${t('taskMarkDone')} ${escapeHtml(task.title)}"></label>
        <div class="hub-task-content"><strong>${escapeHtml(task.title)}</strong>
          ${task.details?`<p>${escapeHtml(task.details)}</p>`:''}
          <div class="hub-chips">${task.priority==='high'?`<span class="hub-chip priority">★ ${t('taskHigh')}</span>`:''}
            ${task.due?`<span class="hub-chip ${overdue?'overdue':''}">📅 ${dateLabel(task.due,lang)}${overdue?' · '+t('taskOverdue'):''}</span>`:''}
            ${task.done?`<span class="hub-chip">✓ ${t('taskDone')}</span>`:''}</div></div>
        ${!formOpen?`<button class="secondary-btn cross-shortcut" type="button" data-task-to-calendar="${escapeHtml(task.id)}" aria-label="${t('crossToCalendar')} ${escapeHtml(task.title)}">${t('crossToCalendar')}</button>`:''}
        <button class="hub-small-btn" type="button" data-task-edit="${escapeHtml(task.id)}" aria-label="${t('taskEdit')} ${escapeHtml(task.title)}">✎</button>
      </article>`;
    }).join('');
  };
  function editor(){
    if(!formOpen)return '';
    const task=editId?data.tasks.find(x=>x.id===editId):null;
    return `<section class="surface hub-editor" id="task-editor"><h2>${task?t('taskEdit'):t('taskNew')}</h2>
      <form id="task-form"><label for="task-title">${t('taskTitle')}</label>
      <input id="task-title" name="title" class="text-field" required maxlength="140" value="${escapeHtml(task?.title||'')}" autocomplete="off">
      <label for="task-details">${t('taskDetails')}</label>
      <textarea id="task-details" name="details" class="text-field" maxlength="2000" rows="3">${escapeHtml(task?.details||'')}</textarea>
      <div class="hub-form-grid"><label for="task-due">${t('taskDue')} (${t('calendarOptional')})<input id="task-due" class="text-field" name="due" type="date" min="1900-01-01" max="2100-12-31" value="${escapeHtml(task?.due||'')}"></label>
      <label for="task-priority">${t('taskPriority')}<select id="task-priority" class="input-select" name="priority"><option value="normal" ${task?.priority!=='high'?'selected':''}>${t('taskNormal')}</option><option value="high" ${task?.priority==='high'?'selected':''}>${t('taskHigh')}</option></select></label></div>
      <div class="hub-actions"><button class="primary-btn" type="submit">${t('taskSave')}</button>
      <button class="secondary-btn" type="button" data-task-action="cancel">${t('cancel')}</button>
      ${task?`<button type="button" class="danger-btn" data-task-delete="${task.id}">${t('delete')}</button>`:''}</div></form></section>`;
  }
  function render(){
    if(disposed)return;
    const stats=taskCounts(data.tasks);
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / TASKS</span><h1>${t('tasks')}</h1><p>${t('taskIntro')}</p></section>
      <section class="surface hub-task-panel"><div class="hub-overview"><div><small>${t('taskOpen')}</small><strong>${stats.open}</strong></div>
       <div><small>${t('taskToday')}</small><strong>${stats.today}</strong></div><div><small>${t('taskDone')}</small><strong>${stats.done}</strong></div></div>
       <div class="row-between hub-top-actions"><h2>${t('taskListHeading')}</h2><button class="primary-btn" type="button" data-task-action="new">+ ${t('taskNew')}</button></div>
       <label class="sr-only" for="task-search">${t('taskSearch')}</label><input id="task-search" type="search" class="text-field" placeholder="${t('taskSearch')}" value="${escapeHtml(search)}">
       <div class="hub-filter-row" role="group" aria-label="${t('taskFilter')}">
       ${['open','today','all','done'].map(value=>`<button type="button" class="${filter===value?'hub-selected':''}" aria-pressed="${filter===value}" data-task-filter="${value}">${t('taskFilter'+value[0].toUpperCase()+value.slice(1))}</button>`).join('')}</div>
       <div class="hub-task-list" id="task-list">${cards()}</div>
       </section>${editor()}<p class="muted hub-footer">${t('taskLocalHint')}</p>`;
  }
  async function persist(next, success){
    if(busy || !validTasksData(next)){notify(t('taskInvalid'));return false;}
    busy=true;
    try{await setMeta('tasksData',next);data=next;success?.();render();return true;}
    catch(err){console.error(err);notify(t('taskSaveError'));return false;}
    finally{busy=false;}
  }
  async function handleClick(event){
    const button=event.target.closest('button');
    if(!button || !element.contains(button)||busy)return;
    const action=button.dataset.taskAction;
    if(action==='new'){
      if(data.tasks.length>=MAX_TASKS){notify(t('taskLimit'));return;}
      editId=null;formOpen=true;render();element.querySelector('#task-title')?.focus();return;
    }
    if(action==='cancel'){editId=null;formOpen=false;render();return;}
    if(button.dataset.taskFilter){filter=button.dataset.taskFilter;render();return;}
    if(button.dataset.taskToCalendar){
      const task=data.tasks.find(item=>item.id===button.dataset.taskToCalendar);
      if(task)onQuickDraft(draftEventFromTask(task));return;
    }
    if(button.dataset.taskEdit){
      const found=data.tasks.find(x=>x.id===button.dataset.taskEdit);
      if(!found)return;
      editId=found.id;formOpen=true;render();element.querySelector('#task-title')?.focus();return;
    }
    if(button.dataset.taskDelete){
      const id=button.dataset.taskDelete;
      if(!data.tasks.some(x=>x.id===id)||!confirmAction(t('taskDeleteConfirm')))return;
      await persist({schema:1,tasks:data.tasks.filter(x=>x.id!==id)},()=>{editId=null;formOpen=false;notify(t('taskDeleted'));});
    }
  }
  async function handleChange(event){
    const input=event.target.closest('[data-task-toggle]');
    if(!input || !element.contains(input)||busy)return;
    const id=input.dataset.taskToggle,original=data.tasks.find(x=>x.id===id);
    if(!original)return;
    await persist({schema:1,tasks:data.tasks.map(x=>x.id===id?{...x,done:input.checked,updatedAt:isoNow()}:x)},()=>notify(t('saved')));
  }
  function handleInput(event){
    if(event.target?.id!=='task-search')return;
    search=event.target.value;
    const list=element.querySelector('#task-list');
    if(list)list.innerHTML=cards(); // Keep input focus and keyboard open.
  }
  async function handleSubmit(event){
    if(event.target?.id!=='task-form'||busy)return;
    event.preventDefault();
    const fd=new FormData(event.target),title=String(fd.get('title')||'').trim();
    const original=editId?data.tasks.find(x=>x.id===editId):null;
    if(editId&&!original)return;
    if(!original && data.tasks.length>=MAX_TASKS){notify(t('taskLimit'));return;}
    const now=isoNow();
    const task={id:original?.id||uid(),title,details:String(fd.get('details')||'').trim(),
      due:String(fd.get('due')||''),priority:String(fd.get('priority')||'normal'),
      done:original?.done||false,createdAt:original?.createdAt||now,updatedAt:now};
    if(!validTask(task)){notify(t('taskInvalid'));return;}
    await persist({schema:1,tasks:original?data.tasks.map(x=>x.id===task.id?task:x):[...data.tasks,task]},
      ()=>{editId=null;formOpen=false;notify(t('taskSaved'));});
  }
  element.addEventListener('click',handleClick);
  element.addEventListener('change',handleChange);
  element.addEventListener('input',handleInput);
  element.addEventListener('submit',handleSubmit);
  render();
  if(formOpen)element.querySelector('#task-editor')?.scrollIntoView({block:'nearest'});
  return ()=>{disposed=true;element.removeEventListener('click',handleClick);
    element.removeEventListener('change',handleChange);element.removeEventListener('input',handleInput);
    element.removeEventListener('submit',handleSubmit);};
}
