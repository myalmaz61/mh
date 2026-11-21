import {getMeta,setMeta} from './db.js';
import {escapeHtml,uid} from './utils.js';
import {emptyBookmarks,validBookmarks,normaliseLink,MAX_BOOKMARKS} from './bookmarks-core.js';
const translations={
  bg:{heading:'Запазени връзки',intro:'Личните ти сайтове и страници на едно място, запазени на телефона.',add:'Нова връзка',edit:'Редакция',title:'Заглавие',url:'Адрес (https://...)',category:'Категория',favourite:'Любима',save:'Запази',cancel:'Отказ',search:'Търси връзки…',all:'Всички',stars:'Любими',open:'Отвори',remove:'Изтрий',empty:'Няма записани връзки.',confirm:'Да изтрия ли тази връзка?',invalid:'Въведи заглавие и валиден http/https адрес, без потребител и парола.',duplicate:'Този адрес вече е записан.',limit:'Лимитът е 500 връзки.',saved:'Връзката е запазена.',deleted:'Връзката е изтрита.',error:'Грешка при запис. Данните не са заменени.',corrupt:'Данните за връзките са повредени. Не са изтрити или презаписани. Първо запази копие на другите данни.',hint:'Отварянето на оригиналния сайт изисква интернет. Запазеният списък работи офлайн.'},
  en:{heading:'Bookmarks',intro:'Saved websites and pages, stored locally on your device.',add:'Add link',edit:'Edit link',title:'Title',url:'URL (https://...)',category:'Category',favourite:'Favourite',save:'Save',cancel:'Cancel',search:'Search bookmarks…',all:'All',stars:'Favourites',open:'Open',remove:'Delete',empty:'No saved links.',confirm:'Delete this bookmark?',invalid:'Enter a title and a valid http/https URL without credentials.',duplicate:'This URL is already saved.',limit:'Maximum 500 links.',saved:'Bookmark saved.',deleted:'Bookmark deleted.',error:'Save failed. Data was not overwritten.',corrupt:'Bookmark data appears corrupt. It has not been deleted or overwritten. Back up your other data first.',hint:'Opening sites needs internet. Your saved list works offline.'}
};
export async function mountBookmarks({element,lang,notify,confirmAction,initialId=null}){
  const l=translations[lang==='en'?'en':'bg'];let data=await getMeta('bookmarksData');
  if(data===undefined)data=emptyBookmarks();
  if(!validBookmarks(data)){
    element.innerHTML=`<section class="tool-head"><h1>${l.heading}</h1></section><section class="surface"><p class="warning-text">${l.corrupt}</p></section>`;
    return()=>{};
  }
  let active='all',query='',editing='',showForm=false,busy=false,disposed=false;
  if(initialId && data.items.some(link=>link.id===initialId)){editing=initialId;showForm=true;}
  function list(){return data.items.filter(x=>(active==='all'||x.favourite)&&`${x.title} ${x.url} ${x.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>Number(b.favourite)-Number(a.favourite)||b.updatedAt.localeCompare(a.updatedAt));}
  function render(){
    if(disposed)return;
    const edit=data.items.find(x=>x.id===editing);
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / UTILITIES</span><h1>${l.heading}</h1><p>${l.intro}</p></section>
      <section class="surface util-card"><button id="bookmark-new" class="primary-btn" type="button">+ ${l.add}</button>
      ${showForm?`<form id="bookmark-form" class="util-form util-bookmark-form">
        <label class="util-label">${l.title}<input name="title" class="text-field" required maxlength="160" value="${escapeHtml(edit?.title||'')}"></label>
        <label class="util-label">${l.url}<input name="url" class="text-field" required type="url" maxlength="2048" inputmode="url" placeholder="https://" value="${escapeHtml(edit?.url||'')}"></label>
        <label class="util-label">${l.category}<input name="category" class="text-field" maxlength="60" value="${escapeHtml(edit?.category||'')}"></label>
        <label class="util-check"><input name="favourite" type="checkbox" ${edit?.favourite?'checked':''}> ${l.favourite}</label>
        <div class="util-actions"><button type="submit" class="primary-btn">${l.save}</button><button type="button" class="secondary-btn" id="bookmark-cancel">${l.cancel}</button></div>
        </form>`:''}</section>
      <section class="surface util-card"><label class="sr-only" for="bookmark-search">${l.search}</label>
        <input id="bookmark-search" type="search" class="text-field" placeholder="${l.search}" value="${escapeHtml(query)}">
        <div class="util-tabs"><button type="button" class="choice-btn ${active==='all'?'selected':''}" data-bookmark-filter="all">${l.all} (${data.items.length})</button>
          <button type="button" class="choice-btn ${active==='stars'?'selected':''}" data-bookmark-filter="stars">★ ${l.stars} (${data.items.filter(x=>x.favourite).length})</button></div>
        <div id="bookmark-results" class="util-bookmark-list">${list().map(item=>`<article class="util-bookmark-item"><div class="util-bookmark-heading"><strong>${escapeHtml(item.title)}</strong>
        <button type="button" class="hub-small-btn" data-bookmark-favourite="${item.id}" aria-label="${l.favourite}" aria-pressed="${item.favourite}">${item.favourite?'★':'☆'}</button></div>
        ${item.category?`<small>${escapeHtml(item.category)}</small>`:''}<p>${escapeHtml(item.url)}</p>
        <div class="util-actions"><a class="secondary-btn util-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${l.open} ↗</a>
        <button type="button" class="secondary-btn" data-bookmark-edit="${item.id}">${l.edit}</button>
        <button type="button" class="danger-btn" data-bookmark-delete="${item.id}">${l.remove}</button></div></article>`).join('')||`<div class="hub-empty">${l.empty}</div>`}</div></section><p class="muted hub-footer">${l.hint}</p>`;
  }
  async function persist(next){
    if(busy||!validBookmarks(next)){notify(l.invalid);return false;}
    busy=true;
    try{await setMeta('bookmarksData',next);data=next;notify(l.saved);render();return true;}
    catch(err){console.error(err);notify(l.error);return false;}
    finally{busy=false;}
  }
  async function click(e){
    const button=e.target.closest('button');if(!button||!element.contains(button)||busy)return;
    if(button.id==='bookmark-new'){showForm=true;editing='';render();element.querySelector('[name="title"]')?.focus();return;}
    if(button.id==='bookmark-cancel'){showForm=false;editing='';render();return;}
    if(button.dataset.bookmarkFilter){active=button.dataset.bookmarkFilter;render();return;}
    const edit=button.dataset.bookmarkEdit,remove=button.dataset.bookmarkDelete,star=button.dataset.bookmarkFavourite;
    if(edit){editing=edit;showForm=true;render();element.querySelector('[name="title"]')?.focus();return;}
    if(remove){if(confirmAction(l.confirm)){const next={schema:1,items:data.items.filter(x=>x.id!==remove)};if(await persist(next))notify(l.deleted);}return;}
    if(star){const next={schema:1,items:data.items.map(x=>x.id===star?{...x,favourite:!x.favourite,updatedAt:new Date().toISOString()}:x)};await persist(next);}
  }
  function input(e){if(e.target.id==='bookmark-search'){query=e.target.value;const container=element.querySelector('#bookmark-results');if(container){const selection=document.activeElement?.selectionStart;render();const input=element.querySelector('#bookmark-search');input.focus();if(selection!==null&&selection!==undefined)input.setSelectionRange(selection,selection);}}}
  async function submit(e){
    if(e.target.id!=='bookmark-form')return;e.preventDefault();if(busy)return;
    const fd=new FormData(e.target),title=String(fd.get('title')||'').trim(),category=String(fd.get('category')||'').trim();let url;
    try{url=normaliseLink(String(fd.get('url')||''));}catch{notify(l.invalid);return;}
    if(!title||title.length>160||category.length>60){notify(l.invalid);return;}
    if(data.items.some(x=>x.url===url&&x.id!==editing)){notify(l.duplicate);return;}
    if(!editing&&data.items.length>=MAX_BOOKMARKS){notify(l.limit);return;}
    const old=data.items.find(x=>x.id===editing),stamp=new Date().toISOString();
    const item={id:old?.id||uid(),title,url,category,favourite:fd.has('favourite'),createdAt:old?.createdAt||stamp,updatedAt:stamp};
    const next={schema:1,items:old?data.items.map(x=>x.id===old.id?item:x):[...data.items,item]};
    // Keep the form visible if the write fails, so typed data is not lost.
    if(await persist(next)){showForm=false;editing='';render();}
  }
  element.addEventListener('click',click);element.addEventListener('input',input);element.addEventListener('submit',submit);
  render();return()=>{disposed=true;element.removeEventListener('click',click);element.removeEventListener('input',input);element.removeEventListener('submit',submit);};
}
