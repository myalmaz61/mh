/** Tasks v1 — independent local-first data model. Date-only values never use Date.parse. */
import { parseYmd, todayLocal, shiftDay } from './calendar-core.js';

export const MAX_TASKS = 1000;
export const TASK_PRIORITIES = Object.freeze(['normal', 'high']);
const validDate = value => value === '' || Boolean(parseYmd(value));
const validStamp = value => typeof value === 'string' && value.length <= 32 &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const validId = value => typeof value === 'string' && /^[-a-zA-Z0-9_]{1,100}$/.test(value);
export const emptyTasks = () => ({schema:1, tasks:[]});

export function validTask(task) {
  return Boolean(task && typeof task === 'object' && !Array.isArray(task) &&
    validId(task.id) && typeof task.title === 'string' && task.title.trim().length > 0 && task.title.length <= 140 &&
    typeof task.details === 'string' && task.details.length <= 2000 &&
    validDate(task.due) && TASK_PRIORITIES.includes(task.priority) && typeof task.done === 'boolean' &&
    validStamp(task.createdAt) && validStamp(task.updatedAt));
}
export function validTasksData(value) {
  if(!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 1 ||
    !Array.isArray(value.tasks) || value.tasks.length > MAX_TASKS) return false;
  const ids = new Set();
  for (const task of value.tasks) {
    if(!validTask(task) || ids.has(task.id))return false;
    ids.add(task.id);
  }
  return true;
}
export function taskCounts(tasks, today=todayLocal()) {
  const open=tasks.filter(t=>!t.done);
  return {total:tasks.length, open:open.length, done:tasks.length-open.length,
    today:open.filter(t=>t.due !== '' && t.due<=today).length,
    overdue:open.filter(t=>t.due !== '' && t.due<today).length};
}
export function filteredTasks(tasks,{filter='open',search='',today=todayLocal()}={}) {
  const term=search.trim().toLocaleLowerCase();
  return tasks.filter(task=>{
    const match = !term || `${task.title} ${task.details}`.toLocaleLowerCase().includes(term);
    if(!match)return false;
    if(filter==='open')return !task.done;
    if(filter==='today')return !task.done && task.due !== '' && task.due<=today;
    if(filter==='done')return task.done;
    return true;
  }).sort((a,b)=>{
    if(a.done!==b.done)return a.done?1:-1;
    if(a.due!==b.due){if(!a.due)return 1;if(!b.due)return -1;return a.due.localeCompare(b.due);}
    if(a.priority!==b.priority)return a.priority==='high'?-1:1;
    return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
  });
}

/** Move an active task to a calendar day relative to TODAY (not its previous due). */
export function quickDeferTask(task,days,{today=todayLocal(),stamp=new Date().toISOString()}={}){
  if(!validTask(task)||task.done||![1,7].includes(days))throw Error('Invalid task reschedule');
  const due=shiftDay(today,days);
  if(!due)throw Error('Invalid target date');
  const result={...task,due,updatedAt:stamp};
  if(!validTask(result))throw Error('Invalid task reschedule');
  return result;
}
