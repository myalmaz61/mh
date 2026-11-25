import { MAX_WEATHER_CITIES } from './config.js';
import { getMeta, updateWeatherCacheCity } from './db.js';
import { escapeHtml } from './utils.js';
import { upcomingRainSummary, rainChanceWindow, reliableRainHours } from './weather-rain-core.js';
import { hourlyProbabilityBar } from './weather-hour-core.js';
import {weatherDayComparison} from './weather-day-compare-core.js';
import {weatherQuickOutlook,weatherQuickTiming} from './weather-quick-core.js';
import {weatherPracticalSummary} from './weather-practical-core.js';
import {weatherSnapshotFreshness} from './weather-freshness-core.js';
import {weatherDayHighlights} from './weather-glance-core.js';
import {forecastRefreshDecision} from './foreground-refresh-core.js';
import {ownsRequest, usableRequestResponse} from './interaction-stability-core.js';
import {networkFallbackKind} from './network-fallback-core.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_GROUPS = [
  {codes:[0],symbol:'☀️',bg:'Ясно',en:'Clear sky'},
  {codes:[1,2],symbol:'🌤️',bg:'Предимно ясно',en:'Partly cloudy'},
  {codes:[3],symbol:'☁️',bg:'Облачно',en:'Overcast'},
  {codes:[45,48],symbol:'🌫️',bg:'Мъгла',en:'Fog'},
  {codes:[51,53,55,56,57],symbol:'🌦️',bg:'Ръмеж',en:'Drizzle'},
  {codes:[61,63,65,66,67],symbol:'🌧️',bg:'Дъжд',en:'Rain'},
  {codes:[71,73,75,77,85,86],symbol:'🌨️',bg:'Сняг',en:'Snow'},
  {codes:[80,81,82],symbol:'🌦️',bg:'Превалявания',en:'Showers'},
  {codes:[95,96,99],symbol:'⛈️',bg:'Гръмотевици',en:'Thunderstorm'},
];
export function weatherDescription(code, lang='bg') {
  const group=WEATHER_GROUPS.find(item=>item.codes.includes(Number(code)));
  return group ? {symbol:group.symbol,text:group[lang]||group.bg} : {symbol:'🌡️',text:lang==='en'?'Weather':'Време'};
}
function finiteNumber(value, low=-10000, high=10000) {
  return typeof value==='number' && Number.isFinite(value) && value>=low && value<=high;
}
function optionalNumber(value,low,high) {return value===null || finiteNumber(value,low,high);}
function validDay(day) {return typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day+'T12:00:00Z'));}
function safeDaily(response) {
  const d=response?.daily;
  if(!d || !Array.isArray(d.time) || d.time.length<1 || d.time.length>7)return null;
  const output=[];
  for(let i=0;i<d.time.length;i++){
    const date=d.time[i], min=d.temperature_2m_min?.[i],max=d.temperature_2m_max?.[i];
    const rain=d.precipitation_sum?.[i] ?? null,prob=d.precipitation_probability_max?.[i] ?? null;
    const wind=d.wind_speed_10m_max?.[i] ?? null,code=d.weather_code?.[i];
    if(!validDay(date) || !finiteNumber(min,-100,80) || !finiteNumber(max,-100,80) || !optionalNumber(rain,0,10000) || !optionalNumber(prob,0,100) || !optionalNumber(wind,0,500) || !finiteNumber(code,0,100))return null;
    output.push({date,min,max,rain,prob,wind,code});
  }
  return output;
}
/** Convert untrusted API JSON to a small, strictly bounded offline snapshot. */
export function parseForecast(json) {
  const c=json?.current;
  if(!c || typeof c.time!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(c.time))throw Error('Missing current weather');
  const numeric=[['temperature_2m',-100,80],['apparent_temperature',-120,90],['relative_humidity_2m',0,100],['wind_speed_10m',0,500],['precipitation',0,10000],['weather_code',0,100]];
  for(const [key,low,high] of numeric)if(!finiteNumber(c[key],low,high))throw Error(`Invalid ${key}`);
  const daily=safeDaily(json);
  if(!daily)throw Error('Missing daily forecast');
  const h=json.hourly;
  const hours=[];
  if(h && Array.isArray(h.time) && Array.isArray(h.precipitation_probability) && Array.isArray(h.temperature_2m)){
    const target=c.time.slice(0,13);
    for(let i=0;i<h.time.length && hours.length<48;i++){
      const time=h.time[i],prob=h.precipitation_probability[i],temp=h.temperature_2m[i];
      const wind=h.wind_speed_10m?.[i] ?? null;
      if(typeof time!=='string'||time.slice(0,13)<target)continue;
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)||!optionalNumber(prob,0,100)||!optionalNumber(temp,-100,80)||!optionalNumber(wind,0,500))continue;
      hours.push({time,prob,temp,wind});
    }
  }
  return {
    current:{time:c.time.slice(0,16),temp:c.temperature_2m,feels:c.apparent_temperature,humidity:c.relative_humidity_2m,
      wind:c.wind_speed_10m,rain:c.precipitation,code:c.weather_code,isDay:c.is_day===1},
    daily,hours,
  };
}
export function forecastUrl(city) {
  const url=new URL(FORECAST_URL);
  url.search=new URLSearchParams({latitude:String(city.latitude),longitude:String(city.longitude),
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    hourly:'temperature_2m,precipitation_probability,wind_speed_10m',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
    timezone:'auto',forecast_days:'7'}).toString();
  return url.toString();
}
export function geocodeUrl(value) {
  const url=new URL(GEOCODE_URL);
  url.search=new URLSearchParams({name:value,count:'8',language:'en',format:'json'}).toString();
  return url.toString();
}
export function parsePlaces(response) {
  if(!Array.isArray(response?.results))return [];
  return response.results.filter(place=>Number.isInteger(place.id) && place.id>0 &&
    typeof place.name==='string' && place.name.length<=80 &&
    finiteNumber(place.latitude,-90,90)&&finiteNumber(place.longitude,-180,180))
    .slice(0,8).map(place=>({id:`geo-${place.id}`,name:place.name.slice(0,80),
      region:(typeof place.admin1==='string'?place.admin1:'').slice(0,80),
      country:(typeof place.country==='string'?place.country:'').slice(0,80),
      latitude:place.latitude,longitude:place.longitude}));
}
export function validSnapshot(entry) {
  if(!entry || typeof entry!=='object' || typeof entry.fetchedAt!=='string' || !Number.isFinite(Date.parse(entry.fetchedAt)))return false;
  const c=entry.current;
  if(!c || typeof c.time!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.time) ||
      !finiteNumber(c.temp,-100,80)||!finiteNumber(c.feels,-120,90)||!finiteNumber(c.humidity,0,100)||
      !finiteNumber(c.wind,0,500)||!finiteNumber(c.rain,0,10000)||!finiteNumber(c.code,0,100)||typeof c.isDay!=='boolean')return false;
  if(!Array.isArray(entry.daily)||entry.daily.length<1||entry.daily.length>7||!Array.isArray(entry.hours)||entry.hours.length>48)return false;
  for(const d of entry.daily){if(!validDay(d.date)||!finiteNumber(d.min,-100,80)||!finiteNumber(d.max,-100,80)||
    !optionalNumber(d.rain,0,10000)||!optionalNumber(d.prob,0,100)||!optionalNumber(d.wind,0,500)||!finiteNumber(d.code,0,100))return false;}
  for(const h of entry.hours){if(typeof h.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(h.time)||
    !optionalNumber(h.temp,-100,80)||!optionalNumber(h.prob,0,100)||
    (h.wind!==undefined && !optionalNumber(h.wind,0,500)))return false;}
  return true;
}
const concise=(n,digits=0)=>n==null?'–':new Intl.NumberFormat('en-GB',{maximumFractionDigits:digits}).format(n);
const fmtDay=(day,lang)=>new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const fmtUpdate=(iso,lang)=>new Intl.DateTimeFormat(lang==='en'?'en-GB':'bg-BG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));

export function mountWeather({element,t,lang,weatherCities,weatherSelectedId,viewState=null,saveWeather,notify}){
  let cities=weatherCities.map(item=>({...item}));
  let selected=cities.some(c=>c.id===weatherSelectedId)?weatherSelectedId:(cities[0]?.id||'');
  let cache={};let destroyed=false;let fetching=null;let fetchingCity=null;let searching=null;let requestSequence=0;
  let failedCity=''; // Ephemeral; never persisted or included in JSON Backup.
  // Reapply saved disclosure panels when the first forecast appears. No weather
  // results or private city queries are persisted in this ephemeral snapshot.
  const initialOpenFolds=new Set(viewState?.folds||[]);
  let firstForecastPainted=false;
  element.innerHTML=`<section class="tool-head"><span class="eyebrow">04 / MYHUB</span><h1>${t('weather')}</h1><p>${t('weatherDesc')}</p></section>
    <section class="surface weather-main">
      <div class="row-between gap-wrap"><h2>${t('weatherPlaces')}</h2><button type="button" class="text-link" id="weather-refresh">↻ ${t('weatherRefresh')}</button></div>
      <label class="sr-only" for="weather-city">${t('weatherSelect')}</label><select id="weather-city" class="input-select weather-picker"></select>
      <p id="weather-network-hint" class="warning-text" role="status" aria-live="polite" hidden></p>
      <div id="weather-content" aria-live="polite"></div>
    </section>
    <details class="surface weather-manage"><summary class="weather-manage-summary"><span>${t('weatherManageCities')}</span><span class="soft-tag" id="weather-city-count"></span></summary>
      <div class="weather-manage-body"><h2>${t('weatherAddCity')}</h2>
      <form id="weather-search-form" class="form-row"><label class="sr-only" for="weather-search-input">${t('weatherCityName')}</label><input class="text-field" id="weather-search-input" type="search" maxlength="70" placeholder="${t('weatherCityName')}" autocomplete="off"><button class="primary-btn" id="weather-search-btn" type="submit">${t('weatherSearch')}</button></form>
      <p class="muted weather-hint">${t('weatherSearchHint')}</p><div id="weather-search-results"></div>
      <div id="weather-saved-cities" class="weather-saved-cities"></div></div>
    </details>
    <p class="weather-source">${t('weatherSource')} <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>`;
  element.querySelector('.weather-manage').open=viewState?.manageOpen===true;
  // Preserve an unfinished city lookup only while this PWA tab is open.
  // Search results are deliberately not replayed: users must query again.
  const citySearchInput=element.querySelector('#weather-search-input');
  citySearchInput.value=typeof viewState?.manageQuery==='string'?viewState.manageQuery.slice(0,70):'';
  const picker=element.querySelector('#weather-city');
  const content=element.querySelector('#weather-content');
  const results=element.querySelector('#weather-search-results');
  const cityCount=element.querySelector('#weather-city-count');
  const saved=element.querySelector('#weather-saved-cities');
  const refreshButton=element.querySelector('#weather-refresh');
  const networkHint=element.querySelector('#weather-network-hint');
  const networkMessages={offlineSaved:'weatherOfflineSaved',offlineEmpty:'weatherOfflineEmpty',
    failedSaved:'weatherFailedSaved',failedEmpty:'weatherFailedEmpty'};
  function paintNetworkHint(){
    const city=cities.find(c=>c.id===selected);
    const kind=city?networkFallbackKind({online:navigator.onLine,hasCache:validSnapshot(cache[city.id]),
      issue:failedCity===city.id?'failed':'',loading:Boolean(fetching&&fetchingCity===city.id&&!fetching.signal.aborted)}):'';
    const key=networkMessages[kind];
    networkHint.hidden=!key;
    networkHint.textContent=key?t(key):'';
  }
  const searchButton=element.querySelector('#weather-search-btn');
  const name=city=>[city.name,city.region,city.country].filter(Boolean).join(', ');
  const abortCurrent=()=>{fetching?.abort();fetching=null;fetchingCity=null;};
  const persistCities=()=>saveWeather({weatherCities:cities,weatherSelectedId:selected});
  function paintCities(){
    picker.innerHTML=cities.map(c=>`<option value="${escapeHtml(c.id)}" ${c.id===selected?'selected':''}>${escapeHtml(name(c))}</option>`).join('');
    picker.disabled=cities.length===0;
    cityCount.textContent=`${cities.length}/${MAX_WEATHER_CITIES}`;
    saved.innerHTML=cities.map(city=>`<div class="weather-saved-row"><span>${escapeHtml(name(city))}</span><button type="button" class="icon-btn small" data-remove-weather="${escapeHtml(city.id)}" aria-label="${t('remove')} ${escapeHtml(city.name)}">×</button></div>`).join('');
  }
  function paint(){
    // Keep the user's open details open across automatic refreshes / cached paints.
    const openFolds=new Set([...content.querySelectorAll('details[data-weather-fold]')]
      .filter(item=>item.open).map(item=>item.dataset.weatherFold));
    if(!firstForecastPainted)for(const key of initialOpenFolds)openFolds.add(key);
    const expanded=key=>openFolds.has(key)?' open':'';
    paintCities();paintNetworkHint();const city=cities.find(c=>c.id===selected);
    refreshButton.disabled=!city;
    if(!city){content.innerHTML=`<div class="weather-empty">${t('weatherEmpty')}</div>`;return;}
    const snapshot=cache[city.id];
    if(!validSnapshot(snapshot)){
      content.innerHTML=`<div class="weather-empty">${t('weatherNotLoaded')}</div>`;return;
    }
    const current=snapshot.current;
    const condition=weatherDescription(current.code,lang);
    const freshness=weatherSnapshotFreshness(snapshot.fetchedAt);
    const stale=freshness.state!=='fresh';
    if(freshness.state==='outdated'){
      // Do not present last day's observation or old hourly values as today's conditions.
      content.innerHTML=`<section class="weather-expired" role="status"><strong>⚠ ${t('weatherOutdatedTitle')}</strong>
        <p>${t('weatherOutdatedHint')}</p>
        <p class="muted">${t('weatherUpdated')}: ${escapeHtml(fmtUpdate(snapshot.fetchedAt,lang))}</p>
        <p class="muted">${condition.symbol} ${concise(current.temp)}°C · ${escapeHtml(condition.text)} — ${t('weatherLastObservation')}</p>
      </section>`;
      return;
    }
    // Only label a window "next hours" if every reported hour has a real
    // probability and the hours are consecutive. Old cache is still available
    // in detailed views, but should not be presented as a fresh rain outlook.
    const rainHours=!stale ? reliableRainHours(snapshot.hours,snapshot.current.time,3) : null;
    const rainSummary=rainHours ? upcomingRainSummary(rainHours) : null;
    const extendedRainHours=rainSummary ? reliableRainHours(snapshot.hours,snapshot.current.time,12,3) : null;
    const rainWindow=extendedRainHours ? rainChanceWindow(extendedRainHours) : null;
    const dayComparison=weatherDayComparison(snapshot.hours,snapshot.current.time);
    const quickOutlook=weatherQuickOutlook(snapshot.hours,snapshot.current.time);
    const quickTiming=weatherQuickTiming(quickOutlook,snapshot.current.time);
    const dayHighlights=weatherDayHighlights(snapshot.daily,snapshot.current.time);
    // A missing hourly interval makes a rain/wind/temperature trend misleading.
    const practical=!stale && quickTiming && !quickTiming.incomplete ? weatherPracticalSummary(quickOutlook) : null;
    const phrase=(key, values={})=>Object.entries(values).reduce((message,[token,value])=>message.replace(`{${token}}`,String(value)),t(key));
    const practicalRain=practical ? phrase(`weatherPracticalRain_${practical.rain.kind}`, {p:concise(practical.rain.peak),time:practical.rain.firstHighTime??''}) : '';
    const practicalWind=practical ? phrase(`weatherPracticalWind_${practical.wind.kind}`, {speed:concise(practical.wind.peak)}) : '';
    const practicalTemp=practical ? phrase(`weatherPracticalTemp_${practical.temperature.kind}`, {change:concise(practical.temperature.change,1)}) : '';
    firstForecastPainted=true;
    content.innerHTML=`<div class="weather-condition">
      <div class="weather-condition-row"><span class="weather-emblem" aria-hidden="true">${condition.symbol}</span><div><div class="weather-temp">${concise(current.temp)}°</div><div class="weather-description">${escapeHtml(condition.text)}</div></div></div>
      <span class="weather-status ${stale?'stale':''}">${stale?t('weatherStored'):t('weatherRecent')}</span>
    </div>${stale?`<p class="weather-snapshot-warning" role="status">⚠ ${t('weatherCachedCaution')}</p>`:''}<p class="weather-updated">${t('weatherUpdated')}: ${escapeHtml(fmtUpdate(snapshot.fetchedAt,lang))} · ${t('weatherLocalTime')}: ${escapeHtml(current.time.slice(11,16))}</p>
    <div class="weather-now-mini"><span>${t('weatherFeels')}: <strong>${concise(current.feels)}°</strong></span><span>${t('weatherWind')}: <strong>${concise(current.wind)} km/h</strong></span></div>
    ${quickOutlook ? `<section class="weather-quick" aria-label="${t('weatherQuickTitle').replace('{n}',String(quickOutlook.hours.length))}">
      <h3 class="weather-quick-title">${t(stale?'weatherQuickAtUpdate':'weatherQuickTitle').replace('{n}',String(quickOutlook.hours.length))}</h3>
      <p class="weather-quick-hint">${t('weatherQuickLocalHint')}${stale?` · ${t('weatherQuickCached')}`:''}</p>
      ${quickTiming?`<p class="weather-quick-hint">${phrase('weatherQuickWindow',{start:quickTiming.start,end:quickTiming.end})}</p>`:''}
      ${quickTiming?.incomplete?`<p class="weather-snapshot-warning" role="status">${t('weatherQuickGaps')}</p>`:''}
      ${practical ? `<div class="weather-practical"><h4>${t('weatherPracticalTitle')}</h4><ul><li><span aria-hidden="true">☔</span>${escapeHtml(practicalRain)}</li><li><span aria-hidden="true">💨</span>${escapeHtml(practicalWind)}</li><li><span aria-hidden="true">🌡️</span>${escapeHtml(practicalTemp)}</li></ul><p>${t('weatherPracticalDisclaimer')}</p></div>` : ''}
      <details class="weather-quick-details" data-weather-fold="quick"${expanded('quick')}><summary>${t('weatherQuickDetails')}</summary>
      <div class="weather-quick-grid">
        <div class="weather-quick-stat"><small>🌡 ${t('weatherQuickTemperature')}</small><strong>${quickOutlook.minTemperature === null?'–':`${concise(quickOutlook.minTemperature)}°`}${quickOutlook.maxTemperature===null||quickOutlook.maxTemperature===quickOutlook.minTemperature?'':` – ${concise(quickOutlook.maxTemperature)}°`}</strong></div>
        <div class="weather-quick-stat"><small>☔ ${t('weatherQuickRain')}</small><strong>${quickOutlook.peakRainProbability===null?'–':`${concise(quickOutlook.peakRainProbability)}%`}</strong>${quickOutlook.peakRainTime?`<small>${escapeHtml(quickOutlook.peakRainTime.slice(11,16))}</small>`:''}</div>
        <div class="weather-quick-stat"><small>💨 ${t('weatherQuickWind')}</small><strong>${quickOutlook.maxWind===null?'–':`${concise(quickOutlook.maxWind)} km/h`}</strong></div>
      </div>
        <div class="weather-quick-rows"><div class="weather-quick-row weather-quick-head"><span>${t('weatherCompareTime')}</span><span>°C</span><span>☔</span><span>km/h</span></div>
        ${quickOutlook.hours.map(hour=>`<div class="weather-quick-row"><span>${escapeHtml(hour.time.slice(11,16))}</span><span>${hour.temp===null?'–':`${concise(hour.temp)}°`}</span><span>${hour.prob===null?'–':`${concise(hour.prob)}%`}</span><span>${hour.wind===null?'–':concise(hour.wind)}</span></div>`).join('')}</div>
      </details>
    </section>`:''}
    ${rainSummary?`<div class="weather-rain-overview"><span>☔ ${t('weatherRainNextHours').replace('{n}',String(rainSummary.count))}</span><strong>${t('weatherMaxRainChance')}: ${concise(rainSummary.maxProbability)}%</strong>
      ${rainWindow ? `<div class="weather-rain-window">${rainWindow.firstTime
        ? `${t('weatherRainFirstHigh')}: <strong>${escapeHtml(rainWindow.firstTime.slice(8,10)+'.'+rainWindow.firstTime.slice(5,7)+' '+rainWindow.firstTime.slice(11,16))} (${t('weatherLocalTime')}) · ${concise(rainWindow.firstProbability)}%</strong>`
        : `${t('weatherRainBelowThreshold').replace('{n}',String(rainWindow.count))}`}</div>` : ''}</div>`:''}
    ${dayHighlights.length?`<section class="weather-highlights" aria-label="${t('weatherGlanceTitle')}">
      <h3 class="weather-subtitle">${t('weatherGlanceTitle')}</h3><div class="weather-highlight-grid">${dayHighlights.map(day=>{
        const w=weatherDescription(day.code,lang);
        return `<div class="weather-highlight-card"><div class="weather-highlight-label"><strong>${t(day.label==='today'?'weatherToday':'weatherTomorrow')}</strong><small>${escapeHtml(fmtDay(day.date,lang))}</small></div>
          <div class="weather-highlight-main"><span role="img" aria-label="${escapeHtml(w.text)}">${w.symbol}</span><strong>${concise(day.max)}° <small>${concise(day.min)}°</small></strong></div>
          <div class="weather-highlight-rain">☔ ${t('weatherRainProbability')}: <strong>${day.prob===null?'–':concise(day.prob)+'%'}</strong></div></div>`;
      }).join('')}</div>
      <p class="weather-highlight-hint">${t(stale?'weatherGlanceCachedHint':'weatherGlanceHint')}</p>
    </section>`:''}
    <div class="weather-folds">
      <details class="weather-fold" data-weather-fold="week"${expanded('week')}><summary>${t('weatherNextDays')} <span aria-hidden="true">⌄</span></summary>
        <div class="weather-week">${snapshot.daily.map(day=>{
          const w=weatherDescription(day.code,lang);
          return `<div class="weather-day"><div class="weather-day-title">${escapeHtml(fmtDay(day.date,lang))}</div><span class="weather-day-icon" aria-label="${escapeHtml(w.text)}" role="img">${w.symbol}</span>
            <div class="weather-day-temp">${concise(day.max)}° <span>${concise(day.min)}°</span></div>
            <div class="weather-day-rain">☔ ${concise(day.prob)}% <small>· ${concise(day.rain,1)} mm</small></div></div>`;
        }).join('')}</div>
      </details>
      ${snapshot.hours.length?`<details class="weather-fold" data-weather-fold="hours"${expanded('hours')}><summary>${t('weatherComingHours')} <span aria-hidden="true">⌄</span></summary>
        <p class="weather-hour-hint">${t('weatherHoursHint')}</p><div class="weather-hours">${snapshot.hours.slice(0,12).map(hour=>{
          const probability=hourlyProbabilityBar(hour.prob);
          return `<div class="weather-hour"><strong>${escapeHtml(hour.time.slice(11,16))}</strong><span>${concise(hour.temp)}°</span><small>☔ ${probability === null ? '–' : `${probability}%`}</small><div class="weather-rain-track" aria-hidden="true"><div class="weather-rain-fill" style="width:${probability === null ? 0 : probability}%"></div></div></div>`;
        }).join('')}</div></details>`:''}
      ${dayComparison ? `<details class="weather-fold" data-weather-fold="compare"${expanded('compare')}><summary>${t('weatherCompareDetails')} <span aria-hidden="true">⌄</span></summary>
        <p class="weather-hour-hint">${t('weatherCompareHint')}</p><div class="weather-compare-grid">${dayComparison.map((day,index)=>`<details class="weather-compare-card" data-weather-fold="compare-${index}"${expanded(`compare-${index}`)}><summary><span><strong>${t(index===0?'weatherToday':'weatherTomorrow')}</strong><small>${escapeHtml(day.date)}</small></span><span>${day.maxProbability===null?'—':`${Math.round(day.maxProbability)}%`} ☔</span></summary><p class="weather-compare-summary">🌡 ${t('weatherCompareTemperature')}: ${day.minTemperature===null?'—':`${concise(day.minTemperature)}°`} – ${day.maxTemperature===null?'—':`${concise(day.maxTemperature)}°`}<span>💨 ${t('weatherComparePeakWind')}: ${day.maxWind===null?'—':`${concise(day.maxWind)} km/h`}</span></p>${day.hours.length?`<div class="weather-compare-rows"><div class="weather-compare-row weather-compare-head"><span>${t('weatherCompareTime')}</span><span>°C</span><span>km/h</span><span>☔</span></div>${day.hours.map(hour=>`<div class="weather-compare-row"><span>${escapeHtml(hour.time.slice(11,16))}</span><span>${hour.temp===null?'—':`${concise(hour.temp)}°`}</span><span>${hour.wind==null?'—':concise(hour.wind)}</span><strong>${hour.prob===null?'—':`${Math.round(hour.prob)}%`}</strong></div>`).join('')}</div>`:`<p class="muted">${t('weatherNoHourlyForDay')}</p>`}</details>`).join('')}</div>
      </details>`:''}
      <details class="weather-fold" data-weather-fold="metrics"${expanded('metrics')}><summary>${t('weatherMoreDetails')} <span aria-hidden="true">⌄</span></summary>
        <div class="weather-stat-grid">
          <div><small>${t('weatherFeels')}</small><strong>${concise(current.feels)}°C</strong></div>
          <div><small>${t('weatherWind')}</small><strong>${concise(current.wind)} km/h</strong></div>
          <div><small>${t('weatherHumidity')}</small><strong>${concise(current.humidity)}%</strong></div>
          <div><small>${t('weatherRainNow')}</small><strong>${concise(current.rain,1)} mm</strong></div>
        </div>
      </details>
    </div>
    <p class="weather-disclaimer">${t('weatherForecastDisclaimer')}</p>`;
  }
  async function getForecast(force=false){
    const city=cities.find(c=>c.id===selected);if(!city)return;
    const snapshot=cache[city.id];
    const decision=forecastRefreshDecision({
      now:Date.now(),fetchedAt:snapshot?.fetchedAt,valid:validSnapshot(snapshot),
      online:navigator.onLine,inFlight:!!(fetching && !fetching.signal.aborted && fetchingCity===city.id),force
    });
    // A fresh forecast or identical in-flight request needs no repaint or abort:
    // keep expanded sections, focus and scroll in place when Android resumes.
    if(decision==='fresh'||decision==='pending'){paintNetworkHint();return;}
    // Keep the existing forecast and any focused/expanded controls in place.
    // Only repaint if there is no cached content to display.
    if(!validSnapshot(snapshot))paint();
    if(decision==='offline'){paintNetworkHint();return;}
    abortCurrent();const token=++requestSequence;
    const ctrl=new AbortController();fetching=ctrl;fetchingCity=city.id;
    refreshButton.disabled=true;refreshButton.textContent=t('weatherLoading');paintNetworkHint();
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;ctrl.abort();},14000);
    try{
      const response=await fetch(forecastUrl(city),{signal:ctrl.signal,cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const body=await response.json();
      const forecast=parseForecast(body);
      if(destroyed || token!==requestSequence)return;
      const updated={fetchedAt:new Date().toISOString(),...forecast};
      const saved=await updateWeatherCacheCity(city.id,updated);
      if(!destroyed && token===requestSequence){
        cache[city.id]=saved||updated;failedCity='';
        paint();
      }
    }catch(error){
      if(!destroyed && token===requestSequence && (error.name!=='AbortError'||timedOut)){
        failedCity=city.id;paintNetworkHint();notify(t('weatherFailed'));
        if(!validSnapshot(cache[city.id]))content.innerHTML=`<div class="weather-empty">${t('weatherFailed')}</div>`;
      }
    }finally{
      clearTimeout(timeout);
      if(fetching===ctrl){fetching=null;fetchingCity=null;}
      if(!destroyed && token===requestSequence){refreshButton.disabled=false;refreshButton.textContent='↻ '+t('weatherRefresh');paintNetworkHint();}
    }
  }
  picker.addEventListener('change',async()=>{
    abortCurrent();requestSequence++;selected=picker.value;
    paint();
    try{await persistCities();if(!destroyed)await getForecast();}catch(err){if(!destroyed)notify(t('error')+': '+err.message);}
  });
  refreshButton.addEventListener('click',()=>void getForecast(true));
  element.querySelector('#weather-search-form').addEventListener('submit',async event=>{
    event.preventDefault(); const value=citySearchInput.value.trim();
    if(value.length<2){notify(t('weatherTypeMore'));return;}
    searching?.abort();const ctrl=new AbortController();searching=ctrl;
    searchButton.disabled=true;results.innerHTML=`<p class="muted">${t('weatherLoading')}</p>`;
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;ctrl.abort();},12000);
    try{
      if(!navigator.onLine)throw Error('offline');
      const response=await fetch(geocodeUrl(value),{signal:ctrl.signal,cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const options=parsePlaces(await response.json());
      // A cancelled request can still finish parsing on some browsers. Only
      // the currently active, non-aborted lookup may display search results.
      if(!usableRequestResponse(searching,ctrl,destroyed))return;
      results.innerHTML=options.length?options.map(place=>`<button type="button" class="weather-search-result" data-add-place="${escapeHtml(place.id)}"><span>＋</span><span>${escapeHtml(name(place))}</span></button>`).join(''):`<p class="muted">${t('weatherNoResults')}</p>`;
      results._weatherPlaces=options;
    }catch(err){if(!destroyed && ownsRequest(searching,ctrl) && (err.name!=='AbortError'||timedOut))results.innerHTML=`<p class="warning-text">${t('weatherSearchFailed')}</p>`;}
    finally{
      clearTimeout(timeout);
      // An older lookup must not re-enable the button or clear the new lookup.
      if(ownsRequest(searching,ctrl)){
        searching=null;
        if(!destroyed)searchButton.disabled=false;
      }
    }
  });
  results.addEventListener('click',async event=>{
    const button=event.target.closest('[data-add-place]');if(!button)return;
    const place=results._weatherPlaces?.find(p=>p.id===button.dataset.addPlace);
    if(!place || cities.some(c=>c.id===place.id)){notify(t('weatherAlreadySaved'));return;}
    if(cities.length>=MAX_WEATHER_CITIES){notify(t('weatherTooMany'));return;}
    cities.push(place);selected=place.id;
    results.innerHTML='';results._weatherPlaces=[];citySearchInput.value='';
    abortCurrent();requestSequence++;paint();
    try{await persistCities();if(!destroyed)void getForecast();}catch(err){if(!destroyed)notify(t('error')+': '+err.message);}
  });
  saved.addEventListener('click',async event=>{
    const button=event.target.closest('[data-remove-weather]');if(!button)return;
    cities=cities.filter(c=>c.id!==button.dataset.removeWeather);
    delete cache[button.dataset.removeWeather];
    if(!cities.some(c=>c.id===selected))selected=cities[0]?.id||'';
    abortCurrent();requestSequence++;paint();
    try{await persistCities();await updateWeatherCacheCity(button.dataset.removeWeather,null);if(!destroyed)void getForecast();}catch(err){if(!destroyed)notify(t('error')+': '+err.message);}
  });
  const onOnline=()=>{if(!destroyed){paintNetworkHint();void getForecast();}};
  const onOffline=()=>{if(!destroyed)paintNetworkHint();};
  window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);
  const onVisible=()=>{if(!document.hidden && !destroyed)void getForecast();};
  document.addEventListener('visibilitychange',onVisible);
  const refreshTimer=setInterval(()=>{if(!document.hidden && !destroyed)void getForecast();},60_000);
  (async()=>{
    try{
      const stored=await getMeta('weatherCache');if(destroyed)return;
      if(stored && typeof stored==='object' && !Array.isArray(stored)){
        for(const city of cities)if(validSnapshot(stored[city.id]))cache[city.id]=stored[city.id];
      }
      paint();void getForecast();
    }catch{if(!destroyed){paint();notify(t('weatherCacheError'));}}
  })();
  paint();
  const release=()=>{destroyed=true;requestSequence++;abortCurrent();searching?.abort();clearInterval(refreshTimer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};
  release.getViewState=()=>({manageOpen:element.querySelector('.weather-manage')?.open===true,manageQuery:citySearchInput.value.slice(0,70),
    folds:[...content.querySelectorAll('details[data-weather-fold]')]
      .filter(item=>item.open).map(item=>item.dataset.weatherFold)});
  return release;
}
