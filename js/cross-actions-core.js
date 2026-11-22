/** MyHub 2.1: safe, unsaved Quick Add drafts made from existing records.
 * No relationship IDs, automatic writes or new IndexedDB stores. */
import { parseYmd, todayLocal } from './calendar-core.js';

const clip=(value,max)=>String(value??'').trim().slice(0,max);
function copyText(text,max=2000){
  const raw=String(text??'').trim();
  return {details:raw.slice(0,max),truncated:raw.length>max};
}
/** A task's optional due date becomes the calendar date, or today if absent. */
export function draftEventFromTask(task, today=todayLocal()) {
  const {details,truncated}=copyText(task?.details,3000);
  const due=parseYmd(task?.due)?task.due:today;
  return {kind:'calendar',title:clip(task?.title,120),details,date:due,time:'',repeat:'none',truncated:truncated||String(task?.title??'').trim().length>120};
}
/** A recurring event uses the DATE SHOWN, not its original series start. */
export function draftTaskFromEvent(event, occurrenceDate) {
  const {details,truncated}=copyText(event?.details,2000);
  return {kind:'task',title:clip(event?.title,140),details,
    due:parseYmd(occurrenceDate)?occurrenceDate:parseYmd(event?.date)?event.date:'',high:false,truncated:truncated||String(event?.title??'').trim().length>140};
}
/** Notes are copied into a new task draft; checklist items are included as lines. */
export function draftTaskFromNote(note) {
  const lines=note?.kind==='checklist' && Array.isArray(note.items)
    ?note.items.filter(item=>item&&!item.done).map(item=>`☐ ${String(item.text??'')}`)
    :[];
  const raw=[String(note?.body??''),...lines].filter(Boolean).join('\n');
  const {details,truncated}=copyText(raw,2000);
  return {kind:'task',title:clip(note?.title,140),details,due:'',high:false,truncated:truncated||String(note?.title??'').trim().length>140};
}
