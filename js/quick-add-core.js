/** Quick Add record builders — match existing Notes and Tasks schemas, no migrations. */
import { validTask } from './tasks-core.js';
import { makeNote, uid } from './utils.js';

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
