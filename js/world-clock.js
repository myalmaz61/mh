import { CITIES } from './config.js';
import { escapeHtml } from './utils.js';

const datePartsCache = new Map();
function getFormatter(zone, locale, options) {
  const cacheKey = JSON.stringify([zone,locale,options]);
  if (!datePartsCache.has(cacheKey)) datePartsCache.set(cacheKey,new Intl.DateTimeFormat(locale, { timeZone:zone, ...options }));
  return datePartsCache.get(cacheKey);
}
export function offsetMinutes(zone, date) {
  const parts = getFormatter(zone,'en-GB',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const p = Object.fromEntries(parts.filter(v=>v.type!=='literal').map(v=>[v.type,Number(v.value)]));
  const utc = Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
  return Math.round((utc - date.getTime()) / 60000);
}
export function formatOffset(total) {
  const sign = total >= 0 ? '+' : '−';
  const minutes = Math.abs(total);
  return `${sign}${Math.floor(minutes/60)}${minutes%60 ? `:${String(minutes%60).padStart(2,'0')}` : ''}`;
}
export function mountWorldClock({ element, t, lang, timeZones, saveZones }) {
  let zones = [...timeZones];
  const locale = lang === 'en' ? 'en-GB' : 'bg-BG';
  element.innerHTML = `<section class="tool-head"><span class="eyebrow">02 / MYHUB</span><h1>${t('clock')}</h1><p>${t('clockDesc')}</p></section>
    <section class="surface"><div class="row-between gap-wrap"><h2>${t('selectedCities')}</h2><span class="soft-tag">DST ✓</span></div>
    <div class="form-row"><label class="sr-only" for="city-select">${t('citySelect')}</label><select id="city-select" class="input-select"></select><button type="button" class="primary-btn" id="add-city">+ ${t('addCity')}</button></div>
    <div id="clock-cards" class="clock-grid"></div></section>`;
  const select=element.querySelector('#city-select');
  const cards=element.querySelector('#clock-cards');
  const add=element.querySelector('#add-city');
  const choices = () => {
    const available=CITIES.filter(c=>!zones.includes(c.zone));
    select.innerHTML=available.length ? available.map(c=>`<option value="${escapeHtml(c.zone)}">${escapeHtml(c[lang])}</option>`).join('') : `<option value="">${t('noMoreCities')}</option>`;
    add.disabled=!available.length;
    select.disabled=!available.length;
  };
  const paintStructure = () => {
    cards.innerHTML=zones.map(zone => {
      const name=CITIES.find(c=>c.zone===zone)?.[lang] || zone;
      return `<article class="city-card" data-zone-card="${escapeHtml(zone)}"><div class="row-between"><span class="city-name">${escapeHtml(name)}</span><button class="icon-btn subtle" type="button" data-remove-city="${escapeHtml(zone)}" aria-label="${t('remove')} ${escapeHtml(name)}">×</button></div>
        <div class="city-time" data-city-time></div><div class="city-bottom"><span data-city-date></span><span data-city-difference></span></div></article>`;
    }).join('') || `<p class="muted">${t('none')}</p>`;
  };
  const tick = () => {
    const now=new Date();
    const base=offsetMinutes('Europe/London',now);
    cards.querySelectorAll('[data-zone-card]').forEach(card=>{
      const zone=card.dataset.zoneCard;
      const clock=getFormatter(zone,locale,{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
      const date=getFormatter(zone,locale,{weekday:'short',day:'numeric',month:'short'}).format(now);
      const diff=offsetMinutes(zone,now)-base;
      card.querySelector('[data-city-time]').textContent=clock;
      card.querySelector('[data-city-date]').textContent=date;
      card.querySelector('[data-city-difference]').textContent=diff===0?t('sameTime'):`${t('clockDifference')}: ${formatOffset(diff)}`;
    });
  };
  const paint = () => {paintStructure();tick();};
  const persist = async () => { await saveZones([...zones]); };
  add.addEventListener('click', async () => {
    const zone=select.value;
    if (!zone || zones.includes(zone) || !CITIES.some(c=>c.zone===zone)) return;
    zones.push(zone); choices(); paint(); await persist();
  });
  cards.addEventListener('click', async event => {
    const button=event.target.closest('[data-remove-city]');
    if (!button) return;
    zones=zones.filter(zone=>zone!==button.dataset.removeCity);
    choices(); paint(); await persist();
  });
  choices(); paint();
  const clockInterval=setInterval(tick,1000);
  const onVisible=()=>{ if(!document.hidden) tick(); };
  document.addEventListener('visibilitychange',onVisible);
  return () => { clearInterval(clockInterval); document.removeEventListener('visibilitychange',onVisible); };
}
