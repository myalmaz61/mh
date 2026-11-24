/** Pure, deliberately conservative helpers for incoming text shares.
 * No network calls; treats shared content as plain text, never HTML.
 */
import {validStoredNote} from './notes-trash-core.js';

const field=(value,max=100000)=>typeof value==='string'?value.slice(0,max).trim():'';
export const SHARED_NOTE_BODY_MAX=100000;

/** Keep the original Android text intact, appending an explicit URL only if
 * it was sent separately and is not already present in the text. */
export function parseSharedNote(payload={}){
  if(!payload || typeof payload!=='object' || Array.isArray(payload))return null;
  const incomingTitle=field(payload.title,200);
  const text=field(payload.text,SHARED_NOTE_BODY_MAX+1);
  const url=field(payload.url,12000);
  const body=text && url && !text.includes(url)?`${text}\n\n${url}`:text||url||incomingTitle;
  if(!body || body.length>SHARED_NOTE_BODY_MAX)return null;
  const title=(incomingTitle || body.split(/\r?\n/,1)[0]).slice(0,200);
  return {title,body,category:''};
}

export function buildSharedNote({title='',body='',category=''}={}, {id,now=new Date().toISOString()}={}){
  if(typeof title!=='string'||typeof body!=='string'||typeof category!=='string'||
      title.length>200||body.length>SHARED_NOTE_BODY_MAX||category.length>40||
      !(title.trim()||body.trim()))throw Error('invalid');
  const item={id:String(id||''),kind:'text',title:title.trim(),body:body.trim(),items:[],
    category:category.trim(),pinned:false,favourite:false,createdAt:now,updatedAt:now};
  if(!validStoredNote(item))throw Error('invalid');
  return item;
}

/** Preserve Bookmarks as the default for real links; free text goes to Notes. */
export function preferredShareDestination(hasLink,hasNote){
  return hasLink?'bookmarks':hasNote?'notes':'bookmarks';
}
