import { escapeHtml } from './utils.js';

// Small deterministic maths parser. No eval(), Function() or third-party code.
export function evaluate(expression) {
  const source = String(expression).replace(/\s/g, '').replace(/[×]/g,'*').replace(/[÷]/g,'/').replace(/,/g,'.');
  if (!source || source.length > 120 || !/^[0-9.+*/()%\-]+$/.test(source)) throw Error('Invalid expression');
  let index = 0;
  const eat = char => source[index] === char ? (index++, true) : false;
  const factor = () => {
    if (eat('+')) return factor();
    if (eat('-')) { const v = factor(); return {value:-v.value,percent:v.percent}; }
    let value;
    if (eat('(')) {
      value = expr();
      if (!eat(')')) throw Error('Missing parenthesis');
    } else {
      const match = /^(?:\d+\.?\d*|\.\d+)/.exec(source.slice(index));
      if (!match) throw Error('Expected number');
      index += match[0].length;
      value = Number(match[0]);
    }
    const pct = eat('%');
    return { value:pct ? value / 100 : value, percent:pct };
  };
  const term = () => {
    let left = factor();
    while (source[index] === '*' || source[index] === '/') {
      const op = source[index++];
      const right = factor();
      if (op === '/' && right.value === 0) throw Error('Division by zero');
      left = { value:op === '*' ? left.value * right.value : left.value / right.value, percent:false };
    }
    return left;
  };
  const expr = () => {
    let left = term().value;
    while (source[index] === '+' || source[index] === '-') {
      const op = source[index++];
      const right = term();
      const addend = right.percent ? left * right.value : right.value;
      left = op === '+' ? left + addend : left - addend;
    }
    return left;
  };
  const result = expr();
  if (index !== source.length || !Number.isFinite(result) || Math.abs(result) > 1e15) throw Error('Invalid result');
  return Number(result.toPrecision(12)).toString();
}

export function mountCalculator({ element, t, history, saveHistory, copyText, confirmAction, lang }) {
  let expression = '';
  let result = '';
  let showingResult = false;
  let records = [...history];
  const keys = [
    ['C','clear','special'], ['(', '(', 'special'], [')', ')', 'special'], ['⌫','back','special'],
    ['7','7',''],['8','8',''],['9','9',''],['÷','÷','operator'],
    ['4','4',''],['5','5',''],['6','6',''],['×','×','operator'],
    ['1','1',''],['2','2',''],['3','3',''],['−','-','operator'],
    ['%','%','special'],['0','0',''],['.','.',''],['+','+','operator'],
  ];
  element.innerHTML = `
    <section class="tool-head"><span class="eyebrow">01 / MYHUB</span><h1>${t('calculator')}</h1><p>${t('calculatorDesc')}</p></section>
    <div class="calc-layout"><section class="surface calculator">
      <label class="sr-only" for="calc-input">${t('calcPlaceholder')}</label>
      <input id="calc-input" class="calc-expression" inputmode="decimal" maxlength="120" placeholder="${t('calcPlaceholder')}" autocomplete="off" spellcheck="false" aria-label="${t('calcPlaceholder')}">
      <div class="calc-output" aria-live="polite" id="calc-output">0</div>
      <button class="small-text-btn calc-copy" id="calc-copy" type="button">⧉ ${t('copy')}</button>
      <div class="calc-grid">${keys.map(([caption,key,style]) => `<button type="button" data-calc="${key}" class="calc-key ${style}">${caption}</button>`).join('')}
        <button type="button" data-calc="=" class="calc-key equals">=</button></div>
      <p class="tiny-hint">200 + 10% = 220</p>
    </section>
    <section class="surface history-card"><div class="row-between"><h2>${t('calcHistory')}</h2><button class="small-text-btn" id="clear-history">${t('calcClearHistory')}</button></div><div id="history-items"></div></section></div>`;
  const input = element.querySelector('#calc-input');
  const output = element.querySelector('#calc-output');
  const historyBox = element.querySelector('#history-items');
  const redrawHistory = () => {
    historyBox.innerHTML = records.length ? records.map((h,idx) => `<button type="button" class="history-item" data-history="${idx}"><span>${escapeHtml(h.expression)}</span><strong>${escapeHtml(h.result)}</strong></button>`).join('') : `<p class="muted">${t('calcNoHistory')}</p>`;
  };
  const updateDisplay = () => { input.value=expression; output.textContent = result || '0'; output.classList.toggle('calc-bad',result === t('calcError')); };
  const calculate = async () => {
    try {
      const calculated = evaluate(expression);
      result = calculated;
      showingResult = true;
      records.unshift({ expression, result:calculated, at:new Date().toISOString() });
      records = records.slice(0,30);
      await saveHistory(records);
      redrawHistory();
    } catch { result = t('calcError'); showingResult = false; }
    updateDisplay();
  };
  const press = (key) => {
    if (key === '=') { void calculate(); return; }
    if (key === 'clear') { expression=''; result=''; showingResult=false; }
    else if (key === 'back') { expression = expression.slice(0,-1); result=''; showingResult=false; }
    else {
      if (showingResult && /[0-9.(]/.test(key)) expression = '';
      else if (showingResult) expression = result;
      showingResult = false;
      result = '';
      if (expression.length < 120) expression += key;
    }
    updateDisplay();
  };
  input.addEventListener('input', () => {
    expression = input.value.replace(/[^0-9+\-*/×÷().%,\s]/g, '').slice(0,120);
    result=''; showingResult=false; updateDisplay();
  });
  input.addEventListener('keydown', event => { if(event.key === 'Enter') { event.preventDefault(); void calculate(); } });
  element.querySelectorAll('[data-calc]').forEach(button => button.addEventListener('click',() => press(button.dataset.calc)));
  element.querySelector('#calc-copy').addEventListener('click', () => { if(result && result !== t('calcError')) void copyText(result); });
  element.querySelector('#clear-history').addEventListener('click', async () => {
    if (!records.length || !confirmAction(t('calcClearConfirm'))) return;
    records=[];
    await saveHistory(records);
    redrawHistory();
  });
  historyBox.addEventListener('click', event => {
    const button=event.target.closest('[data-history]');
    if (!button) return;
    const item=records[Number(button.dataset.history)];
    if (item) { expression=item.expression; result=item.result; showingResult=true; updateDisplay(); window.scrollTo({top:0,behavior:'smooth'}); }
  });
  redrawHistory(); updateDisplay();
  return () => {};
}
