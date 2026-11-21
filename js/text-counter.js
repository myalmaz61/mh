import {countText,MAX_TEXT_LENGTH} from './text-counter-core.js';
const texts={
  bg:{name:'Брояч на текст',intro:'Думи, символи и редове. Текстът не се записва и не напуска устройството.',
    input:'Твоят текст',placeholder:'Напиши или постави текст…',words:'Думи',chars:'Символи',without:'Без интервали',lines:'Редове',paragraphs:'Абзаци',bytes:'UTF-8 байтове',minutes:'Време за четене (мин.)',copy:'Копирай текста',summary:'Копирай статистиката',clear:'Изчисти',empty:'Няма текст за копиране.',confirm:'Да изчистя ли въведения текст?',limit:'Максимум 100 000 символа. Текстът не се запазва.',error:'Неуспешно изчисление.'},
  en:{name:'Text Counter',intro:'Count words, characters and lines. Text is not saved or sent anywhere.',
    input:'Your text',placeholder:'Type or paste text…',words:'Words',chars:'Characters',without:'Without spaces',lines:'Lines',paragraphs:'Paragraphs',bytes:'UTF-8 bytes',minutes:'Reading time (min)',copy:'Copy text',summary:'Copy statistics',clear:'Clear',empty:'Nothing to copy.',confirm:'Clear the entered text?',limit:'Maximum 100,000 characters. Text is never saved.',error:'Could not count text.'}
};
export function mountTextCounter({element,lang,notify,copyText,confirmAction}){
  const l=texts[lang==='en'?'en':'bg'];
  const fields=[['words',l.words],['characters',l.chars],['withoutSpaces',l.without],['lines',l.lines],['paragraphs',l.paragraphs],['bytes',l.bytes],['minutes',l.minutes]];
  element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / UTILITIES</span><h1>${l.name}</h1><p>${l.intro}</p></section>
    <section class="surface mini-tool-card"><label class="mini-tool-label" for="counter-input">${l.input}</label>
    <textarea id="counter-input" class="text-field mini-tool-textarea" maxlength="${MAX_TEXT_LENGTH}" placeholder="${l.placeholder}" spellcheck="true"></textarea>
    <p class="mini-tool-hint">${l.limit}</p><div class="mini-tool-stats" id="counter-stats">${fields.map(([id,title])=>`<div class="mini-tool-stat"><small>${title}</small><strong id="stat-${id}">0</strong></div>`).join('')}</div>
    <div class="mini-tool-actions"><button type="button" class="primary-btn" id="copy-counter-text">${l.copy}</button><button type="button" class="secondary-btn" id="copy-counter-summary">${l.summary}</button><button type="button" class="secondary-btn" id="clear-counter">${l.clear}</button></div></section>`;
  const area=element.querySelector('#counter-input');let last=null;
  const update=()=>{
    try{
      last=countText(area.value,lang);
      for(const [id] of fields)element.querySelector('#stat-'+id).textContent=new Intl.NumberFormat(lang==='en'?'en-GB':'bg-BG').format(last[id]);
    }catch{notify(l.error);}
  };
  const click=event=>{
    const id=event.target.closest('button')?.id;
    if(id==='copy-counter-text'){
      if(!area.value){notify(l.empty);return;}
      void copyText(area.value);
    }else if(id==='copy-counter-summary'){
      if(!last||!area.value){notify(l.empty);return;}
      void copyText(fields.map(([key,title])=>`${title}: ${last[key]}`).join('\n'));
    }else if(id==='clear-counter'&&area.value&&confirmAction(l.confirm)){
      area.value='';update();area.focus();
    }
  };
  area.addEventListener('input',update);
  element.addEventListener('click',click);
  update();
  return()=>{area.removeEventListener('input',update);element.removeEventListener('click',click);};
}
