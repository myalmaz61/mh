import {randomNumbers,pickChoice} from './random-core.js';
const strings={
  bg:{name:'Случаен избор',intro:'Числа или избор от собствен списък. Работи офлайн с криптографски генератор.',numbers:'Числа',choices:'Избор от списък',min:'От',max:'До',count:'Колко числа',unique:'Без повторения',generate:'Генерирай',dice:'Зар (1–6)',hundred:'Число 1–100',options:'Варианти (по един на ред)',placeholder:'Вариант А\nВариант Б\nВариант В',result:'Резултат',copy:'Копирай резултата',empty:'Още няма резултат.',invalid:'Провери стойностите. Числата са от −1 000 000 000 до 1 000 000 000, до 50 наведнъж.',invalidChoices:'Въведи между 2 и 100 различни варианта, всеки до 200 символа.',secure:'Необходим е защитен контекст (HTTPS) за случайни числа.'},
  en:{name:'Random Generator',intro:'Generate numbers or pick from a list. Works offline using cryptographic randomness.',numbers:'Numbers',choices:'Pick from a list',min:'Minimum',max:'Maximum',count:'How many',unique:'No repeats',generate:'Generate',dice:'Dice (1–6)',hundred:'Number 1–100',options:'Options (one per line)',placeholder:'Option A\nOption B\nOption C',result:'Result',copy:'Copy result',empty:'No result yet.',invalid:'Check the settings. Numbers must be within −1,000,000,000 and 1,000,000,000, up to 50 at once.',invalidChoices:'Enter 2–100 different options, up to 200 characters each.',secure:'Random numbers require HTTPS or another secure context.'}
};
export function mountRandomGenerator({element,lang,notify,copyText}){
  const l=strings[lang==='en'?'en':'bg'];let mode='numbers',result='';
  const markup=`<section class="tool-head"><span class="eyebrow">MYHUB / UTILITIES</span><h1>${l.name}</h1><p>${l.intro}</p></section>
    <section class="surface mini-tool-card"><div class="mini-tool-tabs" role="group" aria-label="${l.name}">
      <button type="button" class="choice-btn selected" data-mode="numbers" aria-pressed="true">${l.numbers}</button>
      <button type="button" class="choice-btn" data-mode="choices" aria-pressed="false">${l.choices}</button></div>
    <form id="random-numbers-form" class="mini-tool-form"><div class="mini-tool-two">
      <label class="mini-tool-label">${l.min}<input class="text-field" id="random-min" type="number" step="1" min="-1000000000" max="1000000000" value="1" required></label>
      <label class="mini-tool-label">${l.max}<input class="text-field" id="random-max" type="number" step="1" min="-1000000000" max="1000000000" value="100" required></label></div>
      <label class="mini-tool-label">${l.count}<input class="text-field" id="random-count" type="number" step="1" min="1" max="50" value="1" required></label>
      <label class="mini-tool-check"><input type="checkbox" id="random-unique">${l.unique}</label>
      <div class="mini-tool-actions"><button type="submit" class="primary-btn">${l.generate}</button><button type="button" class="secondary-btn" data-preset="dice">${l.dice}</button><button type="button" class="secondary-btn" data-preset="hundred">${l.hundred}</button></div></form>
    <form id="random-choices-form" class="mini-tool-form" hidden><label class="mini-tool-label" for="random-choices">${l.options}</label>
      <textarea class="text-field mini-tool-textarea" id="random-choices" maxlength="20000" placeholder="${l.placeholder}"></textarea>
      <button type="submit" class="primary-btn">${l.generate}</button></form>
    <div class="mini-tool-output" role="status" aria-live="polite"><small>${l.result}</small><strong id="random-result">—</strong>
    <button type="button" class="secondary-btn" id="random-copy" disabled>${l.copy}</button></div></section>`;
  element.innerHTML=markup;
  const numForm=element.querySelector('#random-numbers-form'),choicesForm=element.querySelector('#random-choices-form');
  const resultEl=element.querySelector('#random-result'),copyBtn=element.querySelector('#random-copy');
  const show=(value)=>{result=String(value);resultEl.textContent=result;copyBtn.disabled=!result;};
  const runNumbers=()=>{
    try{
      const min=Number(element.querySelector('#random-min').value),max=Number(element.querySelector('#random-max').value),count=Number(element.querySelector('#random-count').value),unique=element.querySelector('#random-unique').checked;
      if(!element.querySelector('#random-min').value.trim()||!element.querySelector('#random-max').value.trim()||!element.querySelector('#random-count').value.trim())throw Error('invalid');
      show(randomNumbers({min,max,count,unique}).join(', '));
    }catch(err){show('');resultEl.textContent='—';notify(err.message==='Secure random source unavailable'?l.secure:l.invalid);}
  };
  const submit=e=>{
    if(e.target!==numForm&&e.target!==choicesForm)return;
    e.preventDefault();
    if(e.target===numForm){runNumbers();return;}
    try{show(pickChoice(element.querySelector('#random-choices').value));}
    catch(err){show('');resultEl.textContent='—';notify(err.message==='Secure random source unavailable'?l.secure:l.invalidChoices);}
  };
  const click=e=>{
    const toggle=e.target.closest('[data-mode]');
    if(toggle){
      mode=toggle.dataset.mode;
      numForm.hidden=mode!=='numbers';choicesForm.hidden=mode!=='choices';
      element.querySelectorAll('[data-mode]').forEach(btn=>{const active=btn.dataset.mode===mode;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));});
      return;
    }
    const preset=e.target.closest('[data-preset]');
    if(preset){
      element.querySelector('#random-min').value='1';element.querySelector('#random-max').value=preset.dataset.preset==='dice'?'6':'100';
      element.querySelector('#random-count').value='1';element.querySelector('#random-unique').checked=false;
      runNumbers();return;
    }
    if(e.target.closest('#random-copy')){
      if(!result){notify(l.empty);return;}
      void copyText(result);
    }
  };
  element.addEventListener('click',click);element.addEventListener('submit',submit);
  return()=>{element.removeEventListener('click',click);element.removeEventListener('submit',submit);};
}
