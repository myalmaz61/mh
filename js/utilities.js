import {UNIT_GROUPS,parseQuantity,convertUnits,readableNumber} from './unit-core.js';
import {parseIsoDay,addDays,daysBetween,weekdaysBetween,todayIsoLocal} from './date-core.js';
import {calculatePercent} from './percent-core.js';
import {escapeHtml} from './utils.js';
const translations={
  bg:{unit:'Конвертор',unitIntro:'Бързо преобразуване на мерни единици. Работи офлайн.',category:'Категория',amount:'Стойност',from:'От',to:'Към',swap:'Размени',result:'Резултат',copy:'Копирай',invalid:'Моля, въведи валидна стойност.',date:'Калкулатор за дати',dateIntro:'Разлика между дати и прибавяне или изваждане на дни. Изчислява по календарни дни.',difference:'Разлика между дати',addDays:'Добави / извади дни',firstDate:'Начална дата',secondDate:'Крайна дата',days:'Брой дни',weekdays:'Работни дни (понеделник–петък)',excludeHolidays:'Без приспадане на официални празници.',startDate:'Дата',offset:'Дни (отрицателно число = назад)',calculate:'Изчисли',inclusive:'Включи и крайната дата',dateResult:'Получена дата',percent:'Процентен калкулатор',percentIntro:'Проценти, промяна и ДДС – без интернет.',of:'Колко е A% от B?',what:'A е колко % от B?',change:'Процентна промяна от A до B',increase:'Увеличи A с B%',decrease:'Намали A с B%',vatAdd:'Добави ДДС към A при B%',vatRemove:'Премахни ДДС от A при B%',first:'Стойност A',second:'Стойност B / процент',percentHint:'Стандартната ставка на ДДС във Великобритания е 20%, но провери приложимата ставка за конкретната покупка.',percentResult:'Резултат',errorDate:'Невалидна дата или прекалено голяма разлика.',negative:'отрицателна разлика'},
  en:{unit:'Unit Converter',unitIntro:'Convert everyday measurements offline.',category:'Category',amount:'Value',from:'From',to:'To',swap:'Swap',result:'Result',copy:'Copy',invalid:'Enter a valid value.',date:'Date Calculator',dateIntro:'Difference between dates and adding/subtracting days. Uses calendar dates.',difference:'Difference between dates',addDays:'Add / subtract days',firstDate:'Start date',secondDate:'End date',days:'Days',weekdays:'Weekdays (Monday–Friday)',excludeHolidays:'Public holidays are not excluded.',startDate:'Date',offset:'Days (negative = backwards)',calculate:'Calculate',inclusive:'Include the end date',dateResult:'Result date',percent:'Percentage Calculator',percentIntro:'Percentages, change and VAT, offline.',of:'What is A% of B?',what:'A is what % of B?',change:'Percentage change from A to B',increase:'Increase A by B%',decrease:'Decrease A by B%',vatAdd:'Add VAT to A at B%',vatRemove:'Remove VAT from A at B%',first:'Value A',second:'Value B / percentage',percentHint:'The UK standard VAT rate is 20%, but check the rate applicable to your purchase.',percentResult:'Result',errorDate:'Invalid date or range.',negative:'negative difference'}
};
function createL(lang){return translations[lang==='en'?'en':'bg'];}
async function copy(value,notify,language){
  try{await navigator.clipboard.writeText(value);notify(language==='en'?'Copied':'Копирано');}
  catch{notify(language==='en'?'Copy unavailable':'Копирането не е налично');}
}
export function mountUnitConverter({element,lang,notify}){
  const l=createL(lang);let category='length',from='m',to='km',amount='1',answer='',error='';
  function render(){
    const group=UNIT_GROUPS[category];
    const opts=group.units.map(u=>`<option value="${u[0]}">${escapeHtml(lang==='en'?u[2]:u[1])} (${u[0]})</option>`).join('');
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / UTILITIES</span><h1>${l.unit}</h1><p>${l.unitIntro}</p></section>
      <section class="surface util-card"><label class="util-label" for="unit-category">${l.category}</label>
      <select id="unit-category" class="input-select">${Object.entries(UNIT_GROUPS).map(([id,g])=>`<option value="${id}" ${id===category?'selected':''}>${lang==='en'?g.en:g.bg}</option>`).join('')}</select>
      <form id="unit-form" class="util-form"><label class="util-label" for="unit-amount">${l.amount}</label><input id="unit-amount" class="text-field" name="amount" inputmode="decimal" required maxlength="32" value="${escapeHtml(amount)}">
      <div class="util-grid"><label class="util-label">${l.from}<select class="input-select" name="from" id="unit-from">${opts}</select></label><label class="util-label">${l.to}<select class="input-select" name="to" id="unit-to">${opts}</select></label></div>
      <div class="util-actions"><button class="secondary-btn" type="button" id="unit-swap">⇄ ${l.swap}</button><button class="primary-btn" type="submit">${l.calculate}</button></div></form>
      <div class="util-result" aria-live="polite"><small>${l.result}</small><strong id="unit-answer">${error?escapeHtml(error):escapeHtml(answer||'—')}</strong><button id="unit-copy" class="secondary-btn" type="button" ${!answer?'disabled':''}>${l.copy}</button></div></section>`;
    element.querySelector('#unit-from').value=from;element.querySelector('#unit-to').value=to;
  }
  function compute(){
    try{const num=parseQuantity(amount);answer=readableNumber(convertUnits(category,from,to,num),lang);error='';}
    catch{answer='';error=l.invalid;}
  }
  function change(e){
    if(e.target.id==='unit-category'){
      category=e.target.value;const group=UNIT_GROUPS[category];if(!group)return;
      from=group.units[0][0];to=group.units[Math.min(1,group.units.length-1)][0];compute();render();
    }else if(e.target.id==='unit-from'||e.target.id==='unit-to'){
      from=element.querySelector('#unit-from').value;to=element.querySelector('#unit-to').value;
      amount=element.querySelector('#unit-amount').value;compute();render();
    }
  }
  function submit(e){if(e.target.id!=='unit-form')return;e.preventDefault();amount=element.querySelector('#unit-amount').value;from=element.querySelector('#unit-from').value;to=element.querySelector('#unit-to').value;compute();render();}
  function click(e){
    if(e.target.closest('#unit-swap')){[from,to]=[to,from];amount=element.querySelector('#unit-amount').value;compute();render();}
    if(e.target.closest('#unit-copy')&&answer)void copy(answer,notify,lang);
  }
  element.addEventListener('change',change);element.addEventListener('submit',submit);element.addEventListener('click',click);
  compute();render();return()=>{element.removeEventListener('change',change);element.removeEventListener('submit',submit);element.removeEventListener('click',click);};
}
export function mountDateCalculator({element,lang}){
  const l=createL(lang),today=todayIsoLocal();let start=today,end=today,offset='7',inclusive=false,mode='difference',output='';
  function render(){
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / UTILITIES</span><h1>${l.date}</h1><p>${l.dateIntro}</p></section>
      <section class="surface util-card"><div class="util-tabs"><button class="choice-btn ${mode==='difference'?'selected':''}" type="button" data-date-mode="difference">${l.difference}</button>
      <button class="choice-btn ${mode==='add'?'selected':''}" type="button" data-date-mode="add">${l.addDays}</button></div>
      <form id="date-form" class="util-form">${mode==='difference'?`<div class="util-grid"><label class="util-label">${l.firstDate}<input type="date" class="text-field" id="date-start" required value="${start}" min="1900-01-01" max="2100-12-31"></label>
        <label class="util-label">${l.secondDate}<input type="date" class="text-field" id="date-end" required value="${end}" min="1900-01-01" max="2100-12-31"></label></div>
        <label class="util-check"><input id="date-inclusive" type="checkbox" ${inclusive?'checked':''}> ${l.inclusive}</label>`:
        `<label class="util-label">${l.startDate}<input class="text-field" type="date" id="date-start" required value="${start}" min="1900-01-01" max="2100-12-31"></label>
        <label class="util-label">${l.offset}<input class="text-field" id="date-offset" inputmode="numeric" required value="${escapeHtml(offset)}"></label>`}
      <button class="primary-btn" type="submit">${l.calculate}</button></form>
      <div class="util-result" role="status" aria-live="polite"><small>${mode==='difference'?l.difference:l.dateResult}</small><strong id="date-answer">${output||'—'}</strong></div>
      ${mode==='difference'?`<p class="muted">${l.excludeHolidays}</p>`:''}</section>`;
  }
  function capture(){start=element.querySelector('#date-start')?.value||start;end=element.querySelector('#date-end')?.value||end;offset=element.querySelector('#date-offset')?.value??offset;inclusive=element.querySelector('#date-inclusive')?.checked??inclusive;}
  function compute(){
    try{
      if(mode==='difference'){
        const days=daysBetween(start,end),wd=weekdaysBetween(start,end),sign=days<0?-1:1;
        const endWeekday=new Date(parseIsoDay(end)).getUTCDay();
        const plus=inclusive?sign:0,wdPlus=inclusive&&endWeekday!==0&&endWeekday!==6?sign:0;
        output=`${days+plus} ${l.days.toLocaleLowerCase()} · ${wd+wdPlus} ${l.weekdays.toLocaleLowerCase()}`;
      }else{
        if(!/^[+-]?\d{1,6}$/.test(offset.trim()))throw Error('Invalid number');
        output=addDays(start,Number(offset));
      }
    }catch{output=l.errorDate;}
  }
  function click(e){const btn=e.target.closest('[data-date-mode]');if(btn){capture();mode=btn.dataset.dateMode;output='';render();}}
  function submit(e){if(e.target.id!=='date-form')return;e.preventDefault();capture();compute();render();}
  element.addEventListener('click',click);element.addEventListener('submit',submit);render();
  return()=>{element.removeEventListener('click',click);element.removeEventListener('submit',submit);};
}
export function mountPercentageCalculator({element,lang,notify}){
  const l=createL(lang);let operation='of',first='10',second='200',answer='',error='';
  function calculate(){try{answer=readableNumber(calculatePercent(operation,first,second),lang);error='';}catch{answer='';error=l.invalid;}}
  function render(){
    const operations=['of','what','change','increase','decrease','vatAdd','vatRemove'];
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / UTILITIES</span><h1>${l.percent}</h1><p>${l.percentIntro}</p></section>
      <section class="surface util-card"><label class="util-label" for="pct-operation">${l.calculate}</label><select id="pct-operation" class="input-select">${operations.map(op=>`<option value="${op}" ${op===operation?'selected':''}>${l[op]}</option>`).join('')}</select>
      <form id="pct-form" class="util-form"><div class="util-grid"><label class="util-label">${l.first}<input id="pct-first" class="text-field" inputmode="decimal" maxlength="32" required value="${escapeHtml(first)}"></label>
      <label class="util-label">${l.second}<input id="pct-second" class="text-field" inputmode="decimal" maxlength="32" required value="${escapeHtml(second)}"></label></div>
      <div class="util-actions"><button class="primary-btn" type="submit">${l.calculate}</button></div></form>
      <div class="util-result" role="status" aria-live="polite"><small>${l.percentResult}</small><strong>${error?escapeHtml(error):escapeHtml(answer)}</strong>
        <button id="pct-copy" class="secondary-btn" type="button" ${!answer?'disabled':''}>${l.copy}</button></div><p class="muted">${l.percentHint}</p></section>`;
  }
  function capture(){first=element.querySelector('#pct-first').value;second=element.querySelector('#pct-second').value;}
  function change(e){if(e.target.id==='pct-operation'){capture();operation=e.target.value;if(['vatAdd','vatRemove'].includes(operation))second='20';calculate();render();}}
  function submit(e){if(e.target.id==='pct-form'){e.preventDefault();capture();calculate();render();}}
  function click(e){if(e.target.closest('#pct-copy')&&answer)void copy(answer,notify,lang);}
  element.addEventListener('change',change);element.addEventListener('submit',submit);element.addEventListener('click',click);
  calculate();render();return()=>{element.removeEventListener('change',change);element.removeEventListener('submit',submit);element.removeEventListener('click',click);};
}
