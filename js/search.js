/** Global Search: only reads the data stores; selection opens an existing module. */
import {getNotes,getMeta} from './db.js';
import {escapeHtml} from './utils.js';
import {makeSearchIndex,findInIndex,SEARCH_CATEGORIES,matchExcerpt} from './search-core.js';
import {validTasksData} from './tasks-core.js';
import {validCalendarData} from './calendar-core.js';
import {validQuickListsData} from './quick-list-core.js';
import {validBookmarks} from './bookmarks-core.js';

const words={
  bg:{heading:'Общо търсене',intro:'Намирай бележки, задачи, събития, списъци, връзки и инструменти на едно място.',placeholder:'Напиши дума или част от заглавие…',all:'Всички',note:'Бележки',task:'Задачи',event:'Календар',list:'Списъци',bookmark:'Връзки',tool:'Инструменти',start:'Напиши нещо за търсене. Данните остават на този телефон.',empty:'Няма съвпадения. Опитай с друга дума.',partial:'Някои данни не могат да се прочетат. Нищо не е променено.',results:'Намерени',showing:'Показани',open:'Отвори',offline:'Търсенето работи офлайн и не изпраща данни в интернет.'},
  en:{heading:'Universal Search',intro:'Search notes, tasks, events, checklists, bookmarks and tools in one place.',placeholder:'Enter a word or part of a title…',all:'All',note:'Notes',task:'Tasks',event:'Calendar',list:'Checklists',bookmark:'Bookmarks',tool:'Tools',start:'Type to search. Your data stays on this device.',empty:'No matches. Try another word.',partial:'Some records could not be read. Nothing was changed.',results:'Matches',showing:'Showing',open:'Open',offline:'Search works offline and sends no personal data to the internet.'}
};
const icons={note:'📝',task:'✅',event:'📅',list:'☑️',bookmark:'🔖',tool:'▦'};
const keys=[['tasksData','tasks',validTasksData],['calendarData','events',validCalendarData],['quickListsData','lists',validQuickListsData],['bookmarksData','items',validBookmarks]];
function validNote(note){return note&&typeof note.id==='string'&&typeof note.title==='string'&&typeof note.body==='string'&&Array.isArray(note.items)&&note.items.every(item=>item&&typeof item.text==='string');}

export async function mountSearch({element,lang,t,tools,openResult}){
  const l=words[lang==='en'?'en':'bg'];
  const requests=await Promise.allSettled([getNotes(),...keys.map(([key])=>getMeta(key))]);
  let warnings=0;
  let notes=[];
  if(requests[0].status==='fulfilled'&&Array.isArray(requests[0].value)){
    notes=requests[0].value.filter(validNote);
    if(notes.length!==requests[0].value.length)warnings++;
  }else warnings++;
  const sources={notes,tasks:[],events:[],lists:[],bookmarks:[],tools:tools.map(tool=>({id:tool.id,title:t(tool.title),description:t(tool.description)}))};
  keys.forEach(([key,collection,validate],i)=>{
    const result=requests[i+1];
    if(result.status!=='fulfilled'){warnings++;return;}
    if(result.value===undefined)return;
    if(!validate(result.value)){warnings++;return;}
    sources[collection==='items'?'bookmarks':collection]=result.value[collection];
  });
  const index=makeSearchIndex(sources);
  let category='all',query='',disposed=false,timer=null,currentResults=[];
  element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / SEARCH</span><h1>⌕ ${l.heading}</h1><p>${l.intro}</p></section>
    <section class="surface hub-search-panel"><label class="sr-only" for="hub-universal-search">${l.heading}</label>
      <input class="text-field" id="hub-universal-search" type="search" maxlength="120" placeholder="${l.placeholder}" autocomplete="off" autocorrect="off" spellcheck="false">
      <div class="hub-search-tabs" id="hub-search-tabs" role="group" aria-label="${l.heading}"></div>
      ${warnings?`<p class="warning-text" role="status">${l.partial}</p>`:''}
      <p class="hub-search-count" id="hub-search-count" role="status"></p>
      <div id="hub-search-results" class="hub-search-results"></div></section>
      <p class="muted hub-footer">🔒 ${l.offline}</p>`;
  const input=element.querySelector('#hub-universal-search');
  const tabs=element.querySelector('#hub-search-tabs');
  const list=element.querySelector('#hub-search-results');
  const count=element.querySelector('#hub-search-count');
  function render(){
    if(disposed)return;
    const data=findInIndex(index,query,category,50);
    currentResults=data.results;
    tabs.innerHTML=SEARCH_CATEGORIES.map(kind=>`<button type="button" class="hub-search-tab ${category===kind?'hub-selected':''}" aria-pressed="${category===kind}" data-search-category="${kind}">${l[kind]}${query?` (${data.counts[kind]})`:''}</button>`).join('');
    count.textContent=query?`${l.results}: ${data.total}${data.total>currentResults.length?` · ${l.showing}: ${currentResults.length}`:''}`:'';
    if(!query){list.innerHTML=`<p class="muted hub-search-help">${l.start}</p>`;return;}
    list.innerHTML=currentResults.length?currentResults.map((row,i)=>`<button type="button" class="hub-search-result" data-search-index="${i}">
       <span class="hub-search-result-icon" aria-hidden="true">${icons[row.kind]}</span><span class="hub-search-result-text"><strong>${escapeHtml(row.title)}</strong>
       <small>${l[row.kind]}${matchExcerpt(row,query)?` · ${escapeHtml(matchExcerpt(row,query))}`:''}</small></span><span aria-hidden="true">›</span></button>`).join(''):`<p class="muted hub-search-help">${l.empty}</p>`;
  }
  const onInput=()=>{query=input.value.trim().slice(0,120);clearTimeout(timer);timer=setTimeout(render,95);};
  const onClick=event=>{
    const tab=event.target.closest('[data-search-category]');
    if(tab&&element.contains(tab)){category=tab.dataset.searchCategory;render();return;}
    const button=event.target.closest('[data-search-index]');
    if(!button||!element.contains(button))return;
    const item=currentResults[Number(button.dataset.searchIndex)];
    if(item)openResult(item.route,item.kind==='tool'?null:{id:item.id});
  };
  input.addEventListener('input',onInput);
  element.addEventListener('click',onClick);
  render();input.focus();
  return ()=>{disposed=true;clearTimeout(timer);input.removeEventListener('input',onInput);element.removeEventListener('click',onClick);};
}
