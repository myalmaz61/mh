import {getMeta,appendSharedBookmark} from './db.js';
import {uid} from './utils.js';
import {parseSharedLink,buildSharedBookmark} from './share-core.js';

const INBOX='myhub-share-inbox-v1';
const q=id=>document.getElementById(id);
let receiptKey=null;
let saving=false;
let lang='bg';
let savedItemId=null;
const words={
  bg:{subtitle:'Споделена връзка',heading:'Запази връзка',intro:'Провери адреса, преди да го добавиш в Bookmarks.',title:'Заглавие',url:'Уеб адрес (http/https)',category:'Категория (по желание)',favourite:'Добави към любими',save:'Запази',cancel:'Отказ',open:'Отвори в Bookmarks',home:'Към MyHub',privacy:'🔒 Връзката се обработва локално. Не я изпращаме към външен API.',empty:'Няма получена връзка. Можеш да я въведеш ръчно.',noUrl:'Споделеното съдържание няма валиден http/https адрес. Въведи го ръчно.',failed:'Не успяхме да прочетем споделеното. Можеш да въведеш връзката ръчно.',invalid:'Провери заглавието и адреса (само http/https, без парола).',limit:'Лимитът е 500 връзки. Изтрий ненужна връзка от Bookmarks.',corrupt:'Запазените връзки са повредени. Нищо не е заменено; направи резервно копие.',duplicate:'Тази връзка вече е запазена. Няма да я добавяме втори път.',success:'Връзката е запазена успешно на телефона.',write:'Записът не успя. Провери свободното място и опитай пак. Данните не са заменени.'},
  en:{subtitle:'Shared link',heading:'Save link',intro:'Review the link before adding it to Bookmarks.',title:'Title',url:'Web address (http/https)',category:'Category (optional)',favourite:'Add to favourites',save:'Save',cancel:'Cancel',open:'Open in Bookmarks',home:'Back to MyHub',privacy:'🔒 Your shared link is processed locally. No external API is used.',empty:'No incoming link. You can enter one manually.',noUrl:'Shared content has no valid http/https URL. Enter a link manually.',failed:'Could not read the share. You can enter the link manually.',invalid:'Check the title and URL (http/https, without a password).',limit:'Maximum 500 bookmarks. Delete an unwanted link from Bookmarks.',corrupt:'Stored bookmarks are corrupt. Nothing was overwritten. Make a backup first.',duplicate:'This link is already saved. A duplicate was not created.',success:'Your link was saved on this device.',write:'Could not save. Check storage and try again. Existing data was not overwritten.'}
};
const t=k=>words[lang][k]||k;
function message(key,kind='error') {const el=q('share-message');el.textContent=t(key);el.dataset.kind=kind;}
function showResult(id){
  savedItemId=id;
  q('share-form').hidden=true;
  q('share-result').hidden=false;
  // Only locally generated record IDs are put in a URL, never private link content.
  const to=new URL('./index.html',location.href);
  to.searchParams.set('myhubOpen','bookmarks');to.searchParams.set('id',id);
  q('share-open').href=to.href;
}
async function consumeReceipt(){
  const token=new URL(location.href).searchParams.get('shareId');
  if(!token || !/^[a-f0-9-]{16,64}$/i.test(token))return null;
  receiptKey=new URL('./share.html?shareId='+encodeURIComponent(token),location.href).href;
  const cache=await caches.open(INBOX);
  const response=await cache.match(receiptKey);
  if(!response)return null;
  const body=await response.json();
  return body && typeof body==='object'?body:null;
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
  for(const [id,key] of Object.entries({'share-subtitle':'subtitle','share-heading':'heading','share-intro':'intro','share-favourite-label':'favourite','share-save':'save','share-cancel':'cancel','share-open':'open','share-privacy':'privacy'}))q(id).textContent=t(key);
  document.querySelector('label[for="share-title"]').firstChild.textContent=t('title');
  document.querySelector('label[for="share-url"]').firstChild.textContent=t('url');
  document.querySelector('label[for="share-category"]').firstChild.textContent=t('category');
  q('share-result').querySelector('a.secondary-btn').textContent=t('home');
  let pending=null;
  try{pending=await consumeReceipt();}catch(err){console.warn('Invalid share receipt',err);message('failed');}
  if(!pending){if(!q('share-message').textContent)message(new URL(location.href).searchParams.has('shareError')?'failed':'empty','info');}
  else{
    const parsed=parseSharedLink(pending);
    if(!parsed)message('noUrl');
    else{q('share-title').value=parsed.title;q('share-url').value=parsed.url;}
  }
  q('share-form').addEventListener('submit',async(event)=>{
    event.preventDefault();if(saving||savedItemId)return;
    const oldLabel=q('share-save').textContent;
    saving=true;q('share-save').disabled=true;
    try{
      const record=buildSharedBookmark({url:q('share-url').value,title:q('share-title').value,category:q('share-category').value,favourite:q('share-favourite').checked},{id:uid()});
      await appendSharedBookmark(record);
      await clearReceipt();
      message('success','success');showResult(record.id);
    }catch(err){
      console.warn('Share bookmark save failed:',err);
      if(err?.code==='duplicate'&&err.existingId){await clearReceipt();message('duplicate','info');showResult(err.existingId);}
      else if(['invalid','limit','corrupt'].includes(err?.code))message(err.code);
      else if(err?.message==='invalid'||err?.message==='Invalid link')message('invalid');
      else message('write');
    }finally{saving=false;q('share-save').disabled=false;q('share-save').textContent=oldLabel;}
  });
  q('share-cancel').addEventListener('click',async()=>{await clearReceipt();location.assign('./');});
}
void init().catch(err=>{console.error(err);message('failed');});
