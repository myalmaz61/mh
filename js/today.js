/** Compact, opt-in Today actions. Task writes are transactional; events only navigate. */
import { getMeta, completeTodayTask } from './db.js';
import { escapeHtml } from './utils.js';
import { todaySummary } from './today-core.js';

const words={
  bg:{heading:'Днес',tasks:'Задачи със срок',events:'Събития',overdue:'просрочени',allDay:'Цял ден',
    error:'Не мога да проверя задачите и календара. Данните не са променени.',
    openTasks:'Отвори задачите',openCalendar:'Отвори календара',more:'Покажи подробности',
    done:'Готово',openEvent:'Отвори',saved:'Задачата е изпълнена.',
    stale:'Задачата е променена в друг екран. Списъкът е обновен; провери я отново.',
    failed:'Неуспешен запис. Данните не са променени.',remaining:'още'},
  en:{heading:'Today',tasks:'Tasks due',events:'Events',overdue:'overdue',allDay:'All day',
    error:'Tasks or calendar could not be checked. Your data was not changed.',
    openTasks:'Open tasks',openCalendar:'Open calendar',more:'Show details',
    done:'Done',openEvent:'Open',saved:'Task completed.',
    stale:'This task changed in another view. The list was refreshed; please check it again.',
    failed:'Save failed. Your data was not changed.',remaining:'more'}
};

export function mountToday({element,lang='bg',openTool,notify=()=>{}}){
  const w=words[lang==='en'?'en':'bg'];
  let disposed=false, busy=false, refreshPromise=null, snapshot=null;
  function render(summary){
    const wasOpen=element.querySelector('details.hub-today-detail')?.open===true;
    if(!summary.tasks.length&&!summary.events.length){element.replaceChildren();return;}
    const safe=escapeHtml;
    const tasks=summary.tasks.slice(0,4).map(item=>`<div class="hub-today-line">
      <span>☐ ${safe(item.title)}${item.due<summary.date?' · '+w.overdue:''}</span>
      <button type="button" class="hub-today-complete" data-today-complete="${safe(item.id)}" aria-label="${w.done}: ${safe(item.title)}">✓ ${w.done}</button>
    </div>`).join('');
    const events=summary.events.slice(0,4).map(item=>`<div class="hub-today-line">
      <span>📅 ${item.time?safe(item.time):w.allDay} · ${safe(item.title)}</span>
      <button type="button" class="hub-today-open" data-today-event="${safe(item.id)}" aria-label="${w.openEvent}: ${safe(item.title)}">${w.openEvent} ›</button>
    </div>`).join('');
    const unseen=Math.max(0,summary.tasks.length-4)+Math.max(0,summary.events.length-4);
    const extra=unseen>0?`<p class="hub-today-extra">+${unseen} ${w.remaining}</p>`:'';
    element.innerHTML=`<section class="surface hub-today" aria-label="${w.heading}">
      <div class="hub-today-top"><strong>📌 ${w.heading}</strong><div class="hub-today-counts">
        <span>${w.tasks}: ${summary.tasks.length}</span><span>${w.events}: ${summary.events.length}</span>
        ${summary.overdue?`<span class="hub-today-overdue">${summary.overdue} ${w.overdue}</span>`:''}</div></div>
      <details class="hub-today-detail" ${wasOpen?'open':''}><summary>${w.more}</summary>${tasks}${events}${extra}</details>
      <div class="hub-today-actions"><button type="button" data-today-target="tasks" class="text-link">${w.openTasks} ›</button>
      <button type="button" data-today-target="calendar" class="text-link">${w.openCalendar} ›</button></div>
    </section>`;
  }
  function refresh(){
    if(disposed||busy)return Promise.resolve();
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      try{
        const [tasks,calendar]=await Promise.all([getMeta('tasksData'),getMeta('calendarData')]);
        if(disposed)return;
        snapshot=todaySummary(tasks,calendar);
        render(snapshot);
      }catch(err){
        console.warn('Today summary is unavailable',err);
        snapshot=null;
        if(!disposed)element.innerHTML=`<section class="surface hub-today"><p class="warning-text">${w.error}</p></section>`;
      }
    })().finally(()=>{refreshPromise=null;});
    return refreshPromise;
  }
  const click=async event=>{
    const button=event.target.closest('button');
    if(!button||!element.contains(button)||disposed||busy)return;
    const target=button.dataset.todayTarget;
    if(target==='tasks'||target==='calendar'){openTool(target);return;}
    const eventId=button.dataset.todayEvent;
    if(eventId){
      const found=snapshot?.events.find(item=>item.id===eventId);
      if(found)openTool('calendar',{id:found.id,date:snapshot.date,showDay:true});
      return;
    }
    const id=button.dataset.todayComplete;
    if(!id)return;
    const record=snapshot?.tasks.find(item=>item.id===id);
    if(!record)return;
    busy=true;button.disabled=true;
    try{
      await completeTodayTask(record.id,record.updatedAt);
      if(!disposed)notify(w.saved);
    }catch(err){
      console.warn('Today task update failed',err);
      if(!disposed)notify(['stale','completed','missing'].includes(err?.code)?w.stale:w.failed);
    }finally{
      const reading=refreshPromise;
      if(reading)await reading;
      busy=false;
      if(!disposed)await refresh();
    }
  };
  const visible=()=>{if(!document.hidden)void refresh();};
  element.addEventListener('click',click);
  document.addEventListener('visibilitychange',visible);
  const interval=setInterval(()=>void refresh(),60000);
  void refresh();
  return ()=>{disposed=true;clearInterval(interval);document.removeEventListener('visibilitychange',visible);
    element.removeEventListener('click',click);};
}
