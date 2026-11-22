/** Quick Add record builders — match existing Notes and Tasks schemas, no migrations. */
import { validTask } from './tasks-core.js';
import { makeNote, uid } from './utils.js';
import { todayLocal, validCalendarEvent } from './calendar-core.js';

export function buildQuickTask({title, details='', due='', high=false}, {id=uid(), now=new Date().toISOString()}={}) {
  const record={id,title:String(title??'').trim(),details:String(details??'').trim(),
    due:String(due??''),priority:high?'high':'normal',done:false,createdAt:now,updatedAt:now};
  if(!validTask(record))throw Error('Invalid quick task');
  return record;
}
export function buildQuickNote({title,body=''}, {id=uid(), now=new Date().toISOString()}={}) {
  const cleanTitle=String(title??'').trim(), cleanBody=String(body??'').trim();
  if(!cleanTitle || cleanTitle.length>200 || cleanBody.length>100000)throw Error('Invalid quick note');
  const note=makeNote('text');
  return {...note,id,title:cleanTitle,body:cleanBody,createdAt:now,updatedAt:now};
}

/** Same event schema as Calendar; no parallel storage and no automatic reminders. */
export function buildQuickCalendarEvent({title,details='',date=todayLocal(),time='',repeat='none'},
  {id=uid(),now=new Date().toISOString()}={}) {
  const item={id:String(id),title:String(title??'').trim(),details:String(details??'').trim(),
    date:String(date??''),time:String(time??''),repeat:String(repeat??''),repeatUntil:'',
    createdAt:now,updatedAt:now};
  if(!validCalendarEvent(item))throw Error('Invalid quick calendar event');
  return item;
}
