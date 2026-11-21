/** Small, optional Today summary on the home screen. No background notifications. */
import { getMeta } from './db.js';
import { escapeHtml } from './utils.js';
import { todaySummary } from './today-core.js';
const words={
  bg:{heading:'Днес',tasks:'Задачи със срок',events:'Събития',overdue:'просрочени',allDay:'Цял ден',empty:'',error:'Не мога да проверя задачите и календара. Данните не са променени.',openTasks:'Отвори задачите',openCalendar:'Отвори календара',more:'Покажи подробности'},
  en:{heading:'Today',tasks:'Tasks due',events:'Events',overdue:'overdue',allDay:'All day',empty:'',error:'Tasks or calendar could not be checked. Your data was not changed.',openTasks:'Open tasks',openCalendar:'Open calendar',more:'Show details'}
};
export function mountToday({element, lang='bg', openTool}){
  const w=words[lang==='en'?'en':'bg'];
  let disposed=false, pending=false;
  async function refresh(){
    if(disposed||pending)return;
    pending=true;
    try{
      const [tasks,calendar]=await Promise.all([getMeta('tasksData'),getMeta('calendarData')]);
      if(disposed)return;
      const summary=todaySummary(tasks,calendar);
      if(!summary.tasks.length&&!summary.events.length){element.replaceChildren();return;}
      const safe=escapeHtml;
      element.innerHTML=`<section class="surface hub-today" aria-label="${w.heading}">
        <div class="hub-today-top"><strong>📌 ${w.heading}</strong><div class="hub-today-counts"><span>${w.tasks}: ${summary.tasks.length}</span><span>${w.events}: ${summary.events.length}</span>${summary.overdue?`<span class="hub-today-overdue">${summary.overdue} ${w.overdue}</span>`:''}</div></div>
        <details class="hub-today-detail"><summary>${w.more}</summary>
          ${summary.tasks.slice(0,4).map(item=>`<p>☐ ${safe(item.title)}${item.due<summary.date?' · '+w.overdue:''}</p>`).join('')}
          ${summary.events.slice(0,4).map(event=>`<p>📅 ${event.time?safe(event.time):w.allDay} · ${safe(event.title)}</p>`).join('')}
        </details><div class="hub-today-actions"><button type="button" data-today-target="tasks" class="text-link">${w.openTasks} ›</button>
          <button type="button" data-today-target="calendar" class="text-link">${w.openCalendar} ›</button></div>
      </section>`;
    }catch(err){
      console.warn('Today summary is unavailable',err);
      if(!disposed)element.innerHTML=`<section class="surface hub-today"><p class="warning-text">${w.error}</p></section>`;
    }finally{pending=false;}
  }
  const click=e=>{
    const button=e.target.closest('[data-today-target]');
    if(button&&element.contains(button))openTool(button.dataset.todayTarget);
  };
  const visible=()=>{if(!document.hidden)void refresh();};
  element.addEventListener('click',click);
  document.addEventListener('visibilitychange',visible);
  const interval=setInterval(()=>void refresh(),60000);
  void refresh();
  return ()=>{disposed=true;clearInterval(interval);document.removeEventListener('visibilitychange',visible);element.removeEventListener('click',click);};
}
