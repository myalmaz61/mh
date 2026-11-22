import { getMeta, setMeta } from './db.js';
import { escapeHtml, uid } from './utils.js';
import { CALENDAR_REPEATS, MAX_CALENDAR_EVENTS, emptyCalendar, validCalendarData,
  parseYmd, formatYmd, shiftDay, todayLocal, monthCells, monthEventCounts, eventsForDay, calendarDuplicateDraft } from './calendar-core.js';

const displayDate=(value,lang,options={})=>{
  const p=parseYmd(value);
  if(!p)return value;
  return new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC',...options})
    .format(new Date(Date.UTC(p.year,p.month-1,p.day)));
};
const monthTitle=(year,month,lang)=>new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',
  {month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
const weekdays=(lang)=>{
  const fmt=new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{weekday:'short',timeZone:'UTC'});
  return Array.from({length:7},(_,i)=>fmt.format(new Date(Date.UTC(2026,10,16+i))));
};
const startDraft=date=>({title:'',details:'',date,time:'',repeat:'none',repeatUntil:''});

/** Mount the isolated Calendar screen. The stored value remains in the existing meta store. */
export async function mountCalendar({element,t,lang,notify,confirmAction,initialId=null}){
  let data=await getMeta('calendarData');
  if(data===undefined)data=emptyCalendar();
  if(!validCalendarData(data)){
    element.innerHTML=`<section class="tool-head"><h1>${t('calendar')}</h1></section><section class="surface"><p class="warning-text">${t('calendarCorrupt')}</p></section>`;
    return ()=>{}; // Never overwrite or silently discard damaged existing data.
  }
  const initial=todayLocal(), parsed=parseYmd(initial);
  let year=parsed.year,month=parsed.month,selected=initial,view='month',draft=null,editId=null;
  const initialEvent=initialId?data.events.find(event=>event.id===initialId):null;
  if(initialEvent){const date=parseYmd(initialEvent.date);if(date){year=date.year;month=date.month;selected=initialEvent.date;view='day';editId=initialEvent.id;draft={...initialEvent};}}
  let disposed=false, pending=false;
  const dayEvents=date=>eventsForDay(data.events,date);
  const displayTitle=title=>escapeHtml(title);

  function agenda(date){
    const entries=dayEvents(date);
    return `<div class="cal-agenda-head"><h2>${displayDate(date,lang)}</h2><button class="secondary-btn" type="button" data-cal-action="new">+ ${t('calendarNew')}</button></div>
      ${entries.length?`<div class="cal-events">${entries.map(e=>`<div class="cal-event">
        <span class="cal-event-time">${e.time||t('calendarAllDay')}</span><div class="cal-event-info"><strong>${displayTitle(e.title)}</strong>
        ${e.details?`<p>${escapeHtml(e.details)}</p>`:''}${e.repeat!=='none'?`<small>↻ ${t('calendarRepeat'+e.repeat[0].toUpperCase()+e.repeat.slice(1))}</small>`:''}</div>
        <button class="secondary-btn cal-edit" type="button" data-cal-action="duplicate" data-cal-id="${escapeHtml(e.id)}" aria-label="${t('calendarDuplicate')} ${displayTitle(e.title)}" title="${t('calendarDuplicate')}">⧉</button>
        <button class="secondary-btn cal-edit" type="button" data-cal-action="edit" data-cal-id="${escapeHtml(e.id)}" aria-label="${t('calendarEdit')} ${displayTitle(e.title)}">✎</button>
        </div>`).join('')}</div>`:`<p class="muted cal-empty">${t('calendarNoEvents')}</p>`}`;
  }
  function editor(){
    if(!draft)return '';
    return `<section class="surface cal-editor" id="cal-editor"><h2>${editId?t('calendarEdit'):t('calendarNew')}</h2>
      <p class="muted">${t('calendarSaveHint')}</p>
      <form id="cal-form">
      <label class="cal-label" for="cal-title">${t('calendarTitle')}</label>
      <input class="text-field" id="cal-title" name="title" required maxlength="120" value="${escapeHtml(draft.title)}" autocomplete="off">
      <div class="cal-fields"><label>${t('calendarDate')}<input class="text-field" name="date" type="date" required min="1900-01-01" max="2100-12-31" value="${escapeHtml(draft.date)}"></label>
      <label>${t('calendarTime')}<input class="text-field" name="time" type="time" value="${escapeHtml(draft.time)}"></label></div>
      <label class="cal-label" for="cal-repeat">${t('calendarRepeat')}</label>
      <select class="input-select" id="cal-repeat" name="repeat">${CALENDAR_REPEATS.map(r=>`<option value="${r}" ${draft.repeat===r?'selected':''}>${t('calendarRepeat'+r[0].toUpperCase()+r.slice(1))}</option>`).join('')}</select>
      <label class="cal-label" for="cal-until">${t('calendarUntil')} <small>(${t('calendarOptional')})</small></label>
      <input class="text-field" id="cal-until" name="repeatUntil" type="date" min="${escapeHtml(draft.date)}" max="2100-12-31" value="${escapeHtml(draft.repeatUntil)}" ${draft.repeat==='none'?'disabled':''}>
      <label class="cal-label" for="cal-details">${t('calendarDetails')}</label>
      <textarea class="text-field cal-textarea" id="cal-details" name="details" maxlength="3000" rows="3">${escapeHtml(draft.details)}</textarea>
      <div class="cal-actions"><button type="submit" class="primary-btn">${t('calendarSave')}</button>
      <button type="button" data-cal-action="cancel" class="secondary-btn">${t('cancel')}</button>
      ${editId?`<button type="button" data-cal-action="delete" class="danger-btn">${t('delete')}</button>`:''}</div>
      ${editId?`<p class="muted">${t('calendarEditSeriesHint')}</p>`:''}</form></section>`;
  }
  function render(){
    if(disposed)return;
    const counts=monthEventCounts(data.events,year,month);
    const days=monthCells(year,month);
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / CALENDAR</span><h1>${t('calendar')}</h1><p>${t('calendarIntro')}</p></section>
      <section class="surface cal-card"><div class="cal-toolbar"><div class="cal-toggle" role="group" aria-label="${t('calendarView')}">
        <button type="button" data-cal-action="month-view" aria-pressed="${view==='month'}">${t('calendarMonth')}</button>
        <button type="button" data-cal-action="day-view" aria-pressed="${view==='day'}">${t('calendarDay')}</button></div>
        <button class="secondary-btn" type="button" data-cal-action="today">${t('calendarToday')}</button></div>
      <div class="cal-period"><button class="cal-nav" type="button" data-cal-action="prev" aria-label="${t('calendarPrevious')}">‹</button>
        <strong>${view==='month'?monthTitle(year,month,lang):displayDate(selected,lang)}</strong>
        <button class="cal-nav" type="button" data-cal-action="next" aria-label="${t('calendarNext')}">›</button></div>
      ${view==='month'?`<div class="cal-grid" role="group" aria-label="${t('calendarMonth')}">
        ${weekdays(lang).map(w=>`<span class="cal-weekday">${escapeHtml(w)}</span>`).join('')}
        ${days.map(date=>{const p=parseYmd(date),inMonth=p?.month===month,amount=counts.get(date)||0;
          return `<button type="button" class="cal-cell ${inMonth?'':'cal-other'} ${selected===date?'cal-selected':''} ${todayLocal()===date?'cal-today':''}" data-cal-day="${date}" aria-label="${displayDate(date,lang)} · ${amount}" aria-pressed="${selected===date}">
            <span>${p?.day||''}</span>${amount?`<small>${amount}</small>`:''}</button>`;}).join('')}
      </div>`:''}
      <div class="cal-agenda">${agenda(selected)}</div></section>${editor()}
      <p class="muted cal-disclaimer">${t('calendarNoAlerts')}</p>`;
    if(draft)element.querySelector('#cal-editor')?.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  const movePeriod=step=>{
    if(view==='day'){
      const moved=shiftDay(selected,step);if(!moved)return;
      selected=moved;const p=parseYmd(selected);year=p.year;month=p.month;return;
    }
    let idx=year*12+(month-1)+step;
    if(idx<1900*12||idx>2100*12+11)return;
    year=Math.floor(idx/12);month=idx%12+1;
    selected=formatYmd(year,month,Math.min(parseYmd(selected).day,new Date(Date.UTC(year,month,0)).getUTCDate()));
  };
  const click=async event=>{
    const cell=event.target.closest('[data-cal-day]');
    if(cell&&element.contains(cell)){selected=cell.dataset.calDay;const p=parseYmd(selected);if(!p)return;
      year=p.year;month=p.month;draft=null;editId=null;render();return;}
    const button=event.target.closest('[data-cal-action]');
    if(!button||!element.contains(button)||pending)return;
    const action=button.dataset.calAction;
    if(action==='month-view'||action==='day-view'){view=action==='day-view'?'day':'month';draft=null;editId=null;render();}
    else if(action==='today'){selected=todayLocal();const p=parseYmd(selected);year=p.year;month=p.month;draft=null;editId=null;render();}
    else if(action==='prev'||action==='next'){movePeriod(action==='prev'?-1:1);draft=null;editId=null;render();}
    else if(action==='new'){
      if(data.events.length>=MAX_CALENDAR_EVENTS){notify(t('calendarLimit'));return;}
      editId=null;draft=startDraft(selected);render();element.querySelector('#cal-title')?.focus();
    }
    else if(action==='duplicate'){
      if(data.events.length>=MAX_CALENDAR_EVENTS){notify(t('calendarLimit'));return;}
      const original=data.events.find(e=>e.id===button.dataset.calId);
      if(!original)return;
      editId=null;draft=calendarDuplicateDraft(original,selected);
      render();element.querySelector('#cal-title')?.focus();
    }
    else if(action==='edit'){
      const original=data.events.find(e=>e.id===button.dataset.calId);
      if(!original)return;editId=original.id;draft={...original};render();element.querySelector('#cal-title')?.focus();
    }
    else if(action==='cancel'){draft=null;editId=null;render();}
    else if(action==='delete'&&editId){
      if(!confirmAction(t('calendarDeleteConfirm')))return;
      pending=true;
      try {const next={schema:1,events:data.events.filter(e=>e.id!==editId)};
        await setMeta('calendarData',next);data=next;draft=null;editId=null;notify(t('calendarDeleted'));render();}
      catch(error){console.error(error);notify(t('calendarSaveError'));}finally{pending=false;}
    }
  };
  const change=event=>{
    if(event.target?.name==='repeat'){
      const until=element.querySelector('#cal-until');
      if(until)until.disabled=event.target.value==='none';
    }
    if(event.target?.name==='date'){
      const until=element.querySelector('#cal-until');if(until)until.min=event.target.value;
    }
  };
  const submit=async event=>{
    if(event.target?.id!=='cal-form')return;
    event.preventDefault();if(pending)return;
    const form=event.target;
    const fd=new FormData(form);
    const title=String(fd.get('title')||'').trim(), date=String(fd.get('date')||'');
    const repeat=String(fd.get('repeat')||'none');
    const until=repeat==='none'?'':String(fd.get('repeatUntil')||'');
    const original=editId?data.events.find(e=>e.id===editId):null;
    const iso=new Date().toISOString();
    const item={id:original?.id||uid().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100),title,
      details:String(fd.get('details')||'').trim(),date,time:String(fd.get('time')||''),repeat,repeatUntil:until,
      createdAt:original?.createdAt||iso,updatedAt:iso};
    const next={schema:1,events:original?data.events.map(e=>e.id===original.id?item:e):[...data.events,item]};
    if(!validCalendarData(next)){notify(t('calendarInvalid'));return;}
    pending=true;
    try{
      await setMeta('calendarData',next);data=next;selected=date;
      const p=parseYmd(selected);year=p.year;month=p.month;
      draft=null;editId=null;notify(t('calendarSaved'));render();
    }catch(error){console.error(error);notify(t('calendarSaveError'));}
    finally{pending=false;}
  };
  element.addEventListener('click',click);
  element.addEventListener('change',change);
  element.addEventListener('submit',submit);
  render();
  return ()=>{disposed=true;element.removeEventListener('click',click);element.removeEventListener('change',change);element.removeEventListener('submit',submit);};
}
