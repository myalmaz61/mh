/** Parse Android shared text without executing it or sending it to a server. */
import {normaliseLink,validBookmarks} from './bookmarks-core.js';

export const SHARE_MAX_CHARS=12000;

const safeString=(value,max=SHARE_MAX_CHARS)=>typeof value==='string'?value.slice(0,max).trim():'';
function maybeLink(raw){
  try{return normaliseLink(raw);}catch{return null;}
}
function fromText(raw){
  const text=safeString(raw);
  if(!text)return null;
  const whole=maybeLink(text);
  if(whole)return whole;
  // Android generally places the URL in "text", not in "url".
  const re=/https?:\/\/[^\s<>"'`]+/gi;
  for(const candidate of text.matchAll(re)){
    // Remove sentence punctuation that commonly trails a copied link.
    const cleaned=candidate[0].replace(/[.,!?;:\])}]+$/g,'');
    const found=maybeLink(cleaned);
    if(found)return found;
  }
  return null;
}
export function parseSharedLink(payload={}){
  if(!payload || typeof payload!=='object' || Array.isArray(payload))return null;
  const url=fromText(payload.url)||fromText(payload.text)||fromText(payload.title);
  if(!url)return null;
  const supplied=safeString(payload.title,160);
  let title=supplied && !fromText(supplied)?supplied:'';
  if(!title){
    const text=safeString(payload.text,500);
    const prefix=text.split(/https?:\/\//i,1)[0].trim().replace(/[\s\-:–|]+$/,'');
    title=prefix && prefix.length<160?prefix:new URL(url).hostname;
  }
  return {url,title:title.slice(0,160),category:'',favourite:false};
}
export function buildSharedBookmark({url,title,category='',favourite=false},{id,now=new Date().toISOString()}={}){
  const cleanUrl=normaliseLink(String(url||''));
  const cleanTitle=String(title||'').trim();
  const cleanCategory=String(category||'').trim();
  const item={id:String(id||''),title:cleanTitle,url:cleanUrl,category:cleanCategory,
    favourite:Boolean(favourite),createdAt:now,updatedAt:now};
  if(!validBookmarks({schema:1,items:[item]}))throw Error('invalid');
  return item;
}
