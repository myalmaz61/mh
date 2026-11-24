/** Global Search: only reads the data stores; selection opens an existing module. */
import {getNotes,getMeta} from './db.js';
import {escapeHtml} from './utils.js';
import {makeSearchIndex,findInIndex,SEARCH_CATEGORIES,matchExcerpt,highlightParts} from './search-core.js';
import {validTasksData} from './tasks-core.js';
import {validCalendarData} from './calendar-core.js';
import {validQuickListsData} from './quick-list-core.js';
import {validBookmarks} from './bookmarks-core.js';

const words={
  bg:{heading:'Общо търсене',intro:'Намирай бележки, задачи, събития, списъци, връзки и инструменти на едно място.',placeholder:'Напиши дума или част от заглавие…',all:'Всички',note:'Бележки',task:'Задачи',event:'Календар',list:'Списъци',bookmark:'Връзки',tool:'Инструменти',start:'Напиши нещо за търсене. Данните остават на този телефон.',empty:'Няма съвпадения. Опитай с друга дума или изключи „Само заглавия“.',partial:'Някои данни не могат да се прочетат. Нищо не е променено.',results:'Намерени',showing:'Показани',open:'Отвори',offline:'Търсенето работи офлайн и не изпраща данни в интернет.',titlesOnly:'Само заглавия',sortLabel:'Подреждане',relevance:'Най-подходящи',newest:'Най-нови',clearFilters:'Изчисти филтрите'},
  en:{heading:'Universal Search',intro:'Search notes, tasks, events, checklists, bookmarks and tools in one place.',placeholder:'Enter a word or part of a title…',all:'All',note:'Notes',task:'Tasks',event:'Calendar',list:'Checklists',bookmark:'Bookmarks',tool:'Tools',start:'Type to search. Your data stays on this device.',empty:'No matches. Try another word or disable “Titles only”.',partial:'Some records could not be read. Nothing was changed.',results:'Matches',showing:'Showing',open:'Open',offline:'Search works offline and sends no personal data to the internet.',titlesOnly:'Titles only',sortLabel:'Sort results',relevance:'Best match',newest:'Most recent',clearFilters:'Clear filters'}
};
const icons={note:'📝',task:'✅',event:'📅',list:'☑️',bookmark:'🔖',tool:'▦'};
const keys=[['tasksData','tasks',validTasksData],['calendarData','events',validCalendarData],['quickListsData','lists',validQuickListsData],['bookmarksData','items',validBookmarks]];
function validNote(note){return note&&typeof note.id==='string'&&typeof note.title==='string'&&typeof note.body==='string'&&Array.isArray(note.items)&&note.items.every(item=>item&&typeof item.text==='string');}

// Render ONLY escaped text from the local search index. <mark> is trusted static markup.
function markedText(text,query){
  return highlightParts(text,query).map(part=>part.matched
    ? `<mark class="hub-search-mark">${escapeHtml(part.text)}</mark>`
    : escapeHtml(part.text)).join('');
}

export async function mountSearch({element,lang,t,tools,viewState=null,openResult}){
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
  let category=viewState?.category??'all',query=viewState?.query??'',titlesOnly=viewState?.titlesOnly===true,sort=viewState?.sort??'relevance',disposed=false,timer=null,currentResults=[];
  element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / SEARCH</span><h1>⌕ ${l.heading}</h1><p>${l.intro}</p></section>
    <section class="surface hub-search-panel"><label class="sr-only" for="hub-universal-search">${l.heading}</label>
      <input class="text-field" id="hub-universal-search" type="search" maxlength="120" placeholder="${l.placeholder}" autocomplete="off" autocorrect="off" spellcheck="false">
      <div class="hub-search-tabs" id="hub-search-tabs" role="group" aria-label="${l.heading}"></div>
      <div class="hub-search-options">
        <button type="button" class="hub-search-tab hub-search-titles" id="hub-search-titles" aria-pressed="false">${l.titlesOnly}</button>
        <label class="hub-search-sort-label" for="hub-search-sort">${l.sortLabel}
          <select id="hub-search-sort" class="hub-search-sort"><option value="relevance">${l.relevance}</option><option value="newest">${l.newest}</option></select>
        </label>
        <button type="button" class="hub-search-reset" id="hub-search-reset" hidden>${l.clearFilters}</button>
      </div>
      ${warnings?`<p class="warning-text" role="status">${l.partial}</p>`:''}
      <p class="hub-search-count" id="hub-search-count" role="status"></p>
      <div id="hub-search-results" class="hub-search-results"></div></section>
      <p class="muted hub-footer">🔒 ${l.offline}</p>`;
  const input=element.querySelector('#hub-universal-search');
  const tabs=element.querySelector('#hub-search-tabs');
  const list=element.querySelector('#hub-search-results');
  const count=element.querySelector('#hub-search-count');
  const titlesButton=element.querySelector('#hub-search-titles');
  const sortSelect=element.querySelector('#hub-search-sort');
  const resetButton=element.querySelector('#hub-search-reset');
  input.value=query;sortSelect.value=sort;
  function render(){
    if(disposed)return;
    const data=findInIndex(index,query,category,50,{titlesOnly,sort});
    currentResults=data.results;
    tabs.innerHTML=SEARCH_CATEGORIES.map(kind=>`<button type="button" class="hub-search-tab ${category===kind?'hub-selected':''}" aria-pressed="${category===kind}" data-search-category="${kind}">${l[kind]}${query?` (${data.counts[kind]})`:''}</button>`).join('');
    titlesButton.classList.toggle('hub-selected',titlesOnly);
    titlesButton.setAttribute('aria-pressed',String(titlesOnly));
    resetButton.hidden=category==='all'&&!titlesOnly&&sort==='relevance';
    count.textContent=query?`${l.results}: ${data.total}${data.total>currentResults.length?` · ${l.showing}: ${currentResults.length}`:''}`:'';
    if(!query){list.innerHTML=`<p class="muted hub-search-help">${l.start}</p>`;return;}
    list.innerHTML=currentResults.length?currentResults.map((row,i)=>{
      const preview=matchExcerpt(row,query);
      return `<button type="button" class="hub-search-result" data-search-index="${i}">
       <span class="hub-search-result-icon" aria-hidden="true">${icons[row.kind]}</span><span class="hub-search-result-text"><strong>${markedText(row.title,query)}</strong>
       <small>${l[row.kind]}${preview?` · ${markedText(preview,query)}`:''}</small></span><span aria-hidden="true">›</span></button>`;
    }).join(''):`<p class="muted hub-search-help">${l.empty}</p>`;
  }
  const onInput=()=>{query=input.value.trim().slice(0,120);clearTimeout(timer);timer=setTimeout(render,95);};
  const onSort=()=>{sort=sortSelect.value==='newest'?'newest':'relevance';render();};
  const onClick=event=>{
    if(event.target.closest('#hub-search-titles')){titlesOnly=!titlesOnly;render();return;}
    if(event.target.closest('#hub-search-reset')){category='all';titlesOnly=false;sort='relevance';sortSelect.value=sort;render();return;}
    const tab=event.target.closest('[data-search-category]');
    if(tab&&element.contains(tab)){category=tab.dataset.searchCategory;render();return;}
    const button=event.target.closest('[data-search-index]');
    if(!button||!element.contains(button))return;
    const item=currentResults[Number(button.dataset.searchIndex)];
    if(item)openResult(item.route,item.kind==='tool'?null:{id:item.id});
  };
  input.addEventListener('input',onInput);
  sortSelect.addEventListener('change',onSort);
  element.addEventListener('click',onClick);
  render();input.focus();
  const release=()=>{disposed=true;clearTimeout(timer);input.removeEventListener('input',onInput);sortSelect.removeEventListener('change',onSort);element.removeEventListener('click',onClick);};
  release.getViewState=()=>({query,category,titlesOnly,sort});
  return release;
}
