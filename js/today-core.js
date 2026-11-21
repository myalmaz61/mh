/** Read-only daily summary. It never modifies Tasks or Calendar. */
import { todayLocal, parseYmd, eventsForDay, validCalendarData, emptyCalendar } from './calendar-core.js';
import { validTasksData, emptyTasks } from './tasks-core.js';

export function todaySummary(tasksData, calendarData, day = todayLocal()) {
  if(!parseYmd(day))throw Error('Invalid day');
  const tasks=tasksData===undefined?emptyTasks():tasksData;
  const calendar=calendarData===undefined?emptyCalendar():calendarData;
  if(!validTasksData(tasks))throw Error('Tasks data is damaged');
  if(!validCalendarData(calendar))throw Error('Calendar data is damaged');
  const due=tasks.tasks.filter(item=>!item.done&&item.due&&item.due<=day)
    .sort((a,b)=>a.due.localeCompare(b.due)||Number(b.priority==='high')-Number(a.priority==='high')||a.title.localeCompare(b.title));
  const events=eventsForDay(calendar.events,day);
  return {date:day, tasks:due, events, overdue:due.filter(x=>x.due<day).length};
}
