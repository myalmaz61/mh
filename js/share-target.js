/** Installed Android Share Target: review locally, then save to Bookmarks or Notes.
 * Never puts private share content in URL parameters or on the network. */
import {getMeta,appendSharedBookmark,appendSharedNote} from './db.js';
import {uid} from './utils.js';
import {parseSharedLink,buildSharedBookmark} from './share-core.js';
import {parseSharedNote,buildSharedNote,preferredShareDestination} from './share-notes-core.js';

const INBOX='myhub-share-inbox-v1';
const q=id=>document.getElementById(id);
let receiptKey=null;
let saving=false;
let lang='bg';
let savedItemId=null;
let destination='bookmarks';
const words={
  bg:{subtitle:'Споделено съдържание',heading:'Запази споделеното',intro:'Прегледай съдържанието и избери къде да го запазиш.',choose:'Къде да запазим?',notes:'📝 Notes',bookmarks:'🔖 Bookmarks',title:'Заглавие',body:'Текст на бележката',url:'Уеб адрес (http/https)',category:'Категория (по желание)',favourite:'Добави към любими',save:'Запази',cancel:'Отказ',openNotes:'Отвори в Notes',openBookmarks:'Отвори в Bookmarks',home:'Към MyHub',privacy:'🔒 Споделеното се обработва локално. Не го изпращаме към външен API.',empty:'Няма получено съдържание. Можеш да въведеш текст или връзка ръчно.',noUrl:'Няма валиден http/https адрес. Избери Notes или въведи връзката ръчно.',failed:'Не успяхме да прочетем споделеното. Можеш да го въведеш ръчно.',tooLarge:'Споделеният текст е твърде дълъг (максимум 100 000 знака). Копирай по-кратка част.',invalidBookmark:'Провери заглавието и адреса (само http/https, без парола).',invalidNote:'Въведи заглавие или текст (до 100 000 знака).',limitBookmarks:'Достигнат е лимитът от 500 връзки.',limitNotes:'Достигнат е лимитът от 2000 бележки.',corrupt:'Запазените връзки са повредени. Нищо не е заменено; направи Backup.',duplicate:'Връзката вече съществува. Не е добавен дубликат.',successBookmark:'Връзката е запазена на телефона.',successNote:'Бележката е запазена на телефона.',write:'Записът не успя. Провери свободното място и опитай пак. Нищо не е изтрито.'},
  en:{subtitle:'Shared content',heading:'Save shared content',intro:'Review the content and choose where to save it.',choose:'Save to',notes:'📝 Notes',bookmarks:'🔖 Bookmarks',title:'Title',body:'Note text',url:'Web address (http/https)',category:'Category (optional)',favourite:'Add to favourites',save:'Save',cancel:'Cancel',openNotes:'Open in Notes',openBookmarks:'Open in Bookmarks',home:'Back to MyHub',privacy:'🔒 Shared content is processed locally. No external API is used.',empty:'No incoming content. You can enter text or a link manually.',noUrl:'No valid http/https URL. Choose Notes or enter the link manually.',failed:'Could not read the share. You can enter it manually.',tooLarge:'Shared text is too long (100,000 characters maximum). Copy a shorter section.',invalidBookmark:'Check the title and URL (http/https, without credentials).',invalidNote:'Enter a title or some text (up to 100,000 characters).',limitBookmarks:'Maximum 500 bookmarks reached.',limitNotes:'Maximum 2,000 notes reached.',corrupt:'Stored bookmarks are corrupt. Nothing was overwritten; make a Backup.',duplicate:'This bookmark already exists. A duplicate was not created.',successBookmark:'Your bookmark was saved on this device.',successNote:'Your note was saved on this device.',write:'Could not save. Check storage and retry. Existing data was not removed.'}
};
const t=k=>words[lang][k]||k;
function message(key,kind='error'){const el=q('share-message');el.textContent=t(key);el.dataset.kind=kind;}
function selectDestination(mode){
  destination=mode==='notes'?'notes':'bookmarks';
  q('dest-notes').checked=destination==='notes';
  q('dest-bookmarks').checked=destination==='bookmarks';
  q('share-note-fields').hidden=destination!=='notes';
  q('share-bookmark-fields').hidden=destination!=='bookmarks';
  q('share-url').required=destination==='bookmarks';
  q('share-title').required=destination==='bookmarks';
  q('share-title').maxLength=destination==='bookmarks'?160:200;
  if(q('share-message').dataset.kind!=='success')q('share-message').textContent='';
}
function showResult(id,mode){
  savedItemId=id;
  q('share-form').hidden=true;
  q('share-result').hidden=false;
  const to=new URL('./index.html',location.href);
  to.searchParams.set('myhubOpen',mode);
  to.searchParams.set('id',id); // Only locally generated IDs, never shared text or links.
  q('share-open').href=to.href;
  q('share-open').textContent=t(mode==='notes'?'openNotes':'openBookmarks');
}
async function consumeReceipt(){
  const token=new URL(location.href).searchParams.get('shareId');
  if(!token || !/^[a-f0-9-]{16,64}$/i.test(token))return null;
  receiptKey=new URL('./share.html?shareId='+encodeURIComponent(token),location.href).href;
  const response=await (await caches.open(INBOX)).match(receiptKey);
  if(!response)return null;
  const body=await response.json();
  return body && typeof body==='object' && !Array.isArray(body)?body:null;
}
async function clearReceipt(){
  if(!receiptKey)return;
  try{await (await caches.open(INBOX)).delete(receiptKey);}catch(e){console.warn('Share inbox cleanup:',e);}
  receiptKey=null;
  window.history.replaceState(null,'',new URL('./share.html',location.href).pathname);
}
async function init(){
  try{
    const settings=await getMeta('settings');
    lang=settings?.language==='en'?'en':'bg';
    const mode=settings?.theme==='dark'?'dark':settings?.theme==='light'?'light':matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
    document.documentElement.dataset.theme=mode;document.documentElement.lang=lang;
  }catch(err){console.warn('Share settings unavailable:',err);}
  for(const [id,key] of Object.entries({
    'share-subtitle':'subtitle','share-heading':'heading','share-intro':'intro','share-destination-label':'choose',
    'share-notes-label':'notes','share-bookmarks-label':'bookmarks','share-title-label':'title',
    'share-body-label':'body','share-url-label':'url','share-note-category-label':'category',
    'share-category-label':'category','share-favourite-label':'favourite','share-save':'save',
    'share-cancel':'cancel','share-home':'home','share-privacy':'privacy'
  }))q(id).textContent=t(key);
  q('share-result').hidden=true;
  for(const input of document.querySelectorAll('input[name="destination"]')){
    input.addEventListener('change',()=>{if(input.checked)selectDestination(input.value);});
  }
  let pending=null;
  try{pending=await consumeReceipt();}catch(err){console.warn('Invalid share receipt',err);message('failed');}
  const link=pending?parseSharedLink(pending):null;
  const note=pending?parseSharedNote(pending):null;
  if(pending){
    if(link){q('share-title').value=link.title;q('share-url').value=link.url;}
    if(note){
      q('share-body').value=note.body;
      if(!link)q('share-title').value=note.title;
    }
  }
  const start=preferredShareDestination(Boolean(link),Boolean(note));
  selectDestination(start);
  if(!pending){
    const error=new URL(location.href).searchParams.get('shareError');
    if(error==='tooLarge')message('tooLarge');
    else if(!q('share-message').textContent)message(error?'failed':'empty','info');
  }else if(!link && !note)message('failed');
  q('share-form').addEventListener('submit',async(event)=>{
    event.preventDefault();if(saving||savedItemId)return;
    saving=true;q('share-save').disabled=true;
    try{
      const id=uid();
      if(destination==='notes'){
        const item=buildSharedNote({title:q('share-title').value,body:q('share-body').value,category:q('share-note-category').value},{id});
        await appendSharedNote(item);
        await clearReceipt();
        message('successNote','success');showResult(item.id,'notes');
      }else{
        const item=buildSharedBookmark({url:q('share-url').value,title:q('share-title').value,category:q('share-category').value,favourite:q('share-favourite').checked},{id});
        await appendSharedBookmark(item);
        await clearReceipt();
        message('successBookmark','success');showResult(item.id,'bookmarks');
      }
    }catch(err){
      console.warn('Share save failed:',err);
      if(destination==='bookmarks' && err?.code==='duplicate' && err.existingId){
        await clearReceipt();message('duplicate','info');showResult(err.existingId,'bookmarks');
      }else if(err?.code==='corrupt')message('corrupt');
      else if(err?.code==='limit')message(destination==='notes'?'limitNotes':'limitBookmarks');
      else if(err?.code==='invalid'||err?.message==='invalid'||err?.message==='Invalid link')message(destination==='notes'?'invalidNote':'invalidBookmark');
      else message('write');
    }finally{saving=false;q('share-save').disabled=false;}
  });
  q('share-cancel').addEventListener('click',async()=>{await clearReceipt();location.assign('./');});
}
void init().catch(err=>{console.error(err);message('failed');});
