import { getMeta, setMeta } from './db.js';
import { escapeHtml, uid } from './utils.js';
import { MAX_TIMER_MS, MAX_STOPWATCH_MS, MAX_LAPS, MAX_PRESETS, defaultTimerData, normaliseTimerData,
  remainingCountdown, stopwatchElapsed, settleTimer, formatDuration } from './timer-core.js';

const numberField=(id,value,max,label,disabled)=>`<label class="tm-number-wrap" for="${id}"><span>${label}</span><input class="tm-number" id="${id}" inputmode="numeric" type="number" min="0" max="${max}" step="1" value="${escapeHtml(value)}" ${disabled?'disabled':''}></label>`;
const timeParts=ms=>{
  const seconds=Math.ceil(ms/1000);
  return {hours:String(Math.floor(seconds/3600)),minutes:String(Math.floor(seconds%3600/60)),seconds:String(seconds%60)};
};
const parsePart=(raw,max)=>/^\d+$/.test(raw.trim()) && Number(raw)<=max?Number(raw):null;

/** PWA-only active-screen audio cue. No permission request and no background-alarm promise. */
export async function mountTimer({element,t,lang,notify}){
  let data=normaliseTimerData(await getMeta('timerData'));
  const settled=settleTimer(data);
  if(JSON.stringify(settled)!==JSON.stringify(data)){
    data=settled;
    await setMeta('timerData',data);
  }
  let tab='countdown';
  let input=timeParts(['running','paused'].includes(data.countdown.phase)?data.countdown.remainingMs:data.countdown.durationMs);
  let presetName='';
  let ticker=null, mounted=true, storeQueue=Promise.resolve(), audioContext=null;
  let lastDeadline=data.countdown.phase==='running'?data.countdown.endAt:null;

  const commit=()=>{
    const snapshot=structuredClone(data);
    storeQueue=storeQueue.catch(()=>{}).then(()=>setMeta('timerData',snapshot));
    storeQueue.catch(()=>notify(t('timerSaveFailed')));
  };
  const error=()=>notify(t('timerInvalidDuration'));
  function readInputs(){
    const h=parsePart(input.hours,23), m=parsePart(input.minutes,59), s=parsePart(input.seconds,59);
    if(h===null||m===null||s===null)return null;
    const duration=((h*3600)+(m*60)+s)*1000;
    return duration>=1000&&duration<=MAX_TIMER_MS?duration:null;
  }
  function unlockSound(){
    try{
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context)return;
      audioContext??=new Context();
      if(audioContext.state==='suspended')void audioContext.resume().catch(()=>{});
    }catch{/* sound optional */}
  }
  function sound(){
    try{
      if(!audioContext||audioContext.state!=='running')return;
      const at=audioContext.currentTime;
      [0,0.26].forEach(offset=>{
        const osc=audioContext.createOscillator(),gain=audioContext.createGain();
        osc.type='sine';osc.frequency.value=880;
        gain.gain.setValueAtTime(0.0001,at+offset);
        gain.gain.exponentialRampToValueAtTime(0.12,at+offset+0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001,at+offset+0.19);
        osc.connect(gain);gain.connect(audioContext.destination);
        osc.start(at+offset);osc.stop(at+offset+0.2);
      });
      navigator.vibrate?.([140,70,140]);
    }catch{/* sound optional */}
  }
  function tick(){
    if(!mounted)return;
    const now=Date.now(), countdown=data.countdown, stopwatch=data.stopwatch;
    if(countdown.phase==='running'&&remainingCountdown(countdown,now)===0){
      const onTime=lastDeadline===countdown.endAt && now-countdown.endAt<1600 && document.visibilityState==='visible';
      data=settleTimer(data,now);lastDeadline=null;commit();render();
      if(onTime){sound();notify(t('timerFinishedMessage'));}
      return;
    }
    if(stopwatch.phase==='running' && stopwatchElapsed(stopwatch,now)>=MAX_STOPWATCH_MS){
      data=settleTimer(data,now);commit();render();return;
    }
    const countdownDisplay=element.querySelector('#tm-countdown-clock');
    if(countdownDisplay){
      countdownDisplay.textContent=formatDuration(Math.ceil(remainingCountdown(countdown,now)/1000)*1000);
      const progress=element.querySelector('#tm-progress');
      if(progress)progress.style.width=`${(100*(1-remainingCountdown(countdown,now)/countdown.durationMs)).toFixed(2)}%`;
    }
    const stopwatchDisplay=element.querySelector('#tm-stopwatch-clock');
    if(stopwatchDisplay)stopwatchDisplay.textContent=formatDuration(stopwatchElapsed(stopwatch,now),{hundredths:true});
  }
  function render(){
    if(!mounted)return;
    const c=data.countdown,s=data.stopwatch;
    const running=c.phase==='running', fixed=running||c.phase==='paused';
    element.innerHTML=`<section class="tool-head"><span class="eyebrow">MYHUB / TIMER</span><h1>${t('timer')}</h1><p>${t('timerPageIntro')}</p></section>
      <div class="tm-tabs" role="group" aria-label="${t('timer')}"><button type="button" data-tm-tab="countdown" aria-pressed="${tab==='countdown'}" class="${tab==='countdown'?'selected':''}">${t('timerCountdown')}</button><button type="button" data-tm-tab="stopwatch" aria-pressed="${tab==='stopwatch'}" class="${tab==='stopwatch'?'selected':''}">${t('timerStopwatch')}</button></div>
      ${tab==='countdown'?`<section class="surface tm-face"><span class="tm-kicker">${t('timerCountdown')}</span><div id="tm-countdown-clock" class="tm-big-time" role="timer" aria-live="off">${formatDuration(Math.ceil(remainingCountdown(c)/1000)*1000)}</div>
        <div class="tm-track"><span id="tm-progress" style="width:${(100*(1-remainingCountdown(c)/c.durationMs)).toFixed(2)}%"></span></div>
        <div class="tm-status">${t('timerStatus'+c.phase[0].toUpperCase()+c.phase.slice(1))}</div>
        <div class="tm-number-grid">${numberField('tm-h',input.hours,23,t('timerHours'),fixed)}${numberField('tm-m',input.minutes,59,t('timerMinutes'),fixed)}${numberField('tm-s',input.seconds,59,t('timerSeconds'),fixed)}</div>
        <div class="tm-actions">${c.phase==='running'?`<button class="primary-btn" data-tm-action="pause">${t('timerPause')}</button>`:c.phase==='paused'?`<button class="primary-btn" data-tm-action="continue">${t('timerContinue')}</button>`:`<button class="primary-btn" data-tm-action="start">${t('timerStart')}</button>`}<button class="secondary-btn" data-tm-action="reset">${t('timerReset')}</button></div></section>
        <section class="surface"><h2>${t('timerPresets')}</h2><p class="muted">${t('timerPresetsHint')}</p><div class="tm-presets">${data.presets.map((p,i)=>`<div class="tm-preset"><button type="button" data-tm-preset="${i}" ${fixed?'disabled':''}>${escapeHtml(p.name)} <small>${formatDuration(p.seconds*1000)}</small></button><button type="button" class="tm-remove" data-tm-remove="${i}" aria-label="${t('remove')} ${escapeHtml(p.name)}">×</button></div>`).join('')||`<p class="muted">${t('timerNoPresets')}</p>`}</div>
        <div class="tm-new-preset"><input class="text-field" id="tm-preset-name" type="text" maxlength="32" value="${escapeHtml(presetName)}" placeholder="${t('timerPresetName')}" aria-label="${t('timerPresetName')}"><button type="button" class="secondary-btn" data-tm-action="save-preset" ${fixed?'disabled':''}>${t('timerSavePreset')}</button></div></section>`
      :`<section class="surface tm-face"><span class="tm-kicker">${t('timerStopwatch')}</span><div id="tm-stopwatch-clock" class="tm-big-time" role="timer" aria-live="off">${formatDuration(stopwatchElapsed(s),{hundredths:true})}</div>
        <div class="tm-status">${t('timerStatus'+s.phase[0].toUpperCase()+s.phase.slice(1))}</div>
        <div class="tm-actions">${s.phase==='running'?`<button class="primary-btn" data-tm-action="sw-pause">${t('timerPause')}</button><button class="secondary-btn" data-tm-action="sw-lap" ${s.laps.length>=MAX_LAPS?'disabled':''}>${t('timerLap')}</button>`:`<button class="primary-btn" data-tm-action="sw-start">${s.phase==='paused'?t('timerContinue'):t('timerStart')}</button><button class="secondary-btn" data-tm-action="sw-reset">${t('timerReset')}</button>`}</div></section>
        <section class="surface"><h2>${t('timerLaps')} <span class="tm-count">${s.laps.length}/${MAX_LAPS}</span></h2><div class="tm-lap-list">${s.laps.length?s.laps.map((v,i)=>`<div class="tm-lap"><span>#${i+1}</span><strong>${formatDuration(v,{hundredths:true})}</strong><small>+ ${formatDuration(v-(s.laps[i-1]||0),{hundredths:true})}</small></div>`).reverse().join(''):`<p class="muted">${t('timerNoLaps')}</p>`}</div></section>`}
      <p class="muted tm-warning">⚠ ${t('timerBackgroundWarning')}</p>`;
    tick();
  }
  const onInput=e=>{
    if(e.target?.id==='tm-preset-name')presetName=e.target.value;
    if(e.target?.id==='tm-h')input.hours=e.target.value;
    if(e.target?.id==='tm-m')input.minutes=e.target.value;
    if(e.target?.id==='tm-s')input.seconds=e.target.value;
    if(['tm-h','tm-m','tm-s'].includes(e.target?.id)&&!['running','paused'].includes(data.countdown.phase)){
      const duration=readInputs(),display=element.querySelector('#tm-countdown-clock');
      if(duration&&display)display.textContent=formatDuration(duration);
    }
  };
  const onClick=e=>{
    const btn=e.target.closest('button');if(!btn||!element.contains(btn)||btn.disabled)return;
    if(btn.hasAttribute('data-tm-tab')){tab=btn.dataset.tmTab;render();return;}
    if(btn.hasAttribute('data-tm-preset')){
      const preset=data.presets[Number(btn.dataset.tmPreset)];if(!preset||data.countdown.phase==='running'||data.countdown.phase==='paused')return;
      data.countdown={phase:'idle',durationMs:preset.seconds*1000,remainingMs:preset.seconds*1000,endAt:null};
      input=timeParts(data.countdown.durationMs);commit();render();return;
    }
    if(btn.hasAttribute('data-tm-remove')){
      const index=Number(btn.dataset.tmRemove);if(!data.presets[index])return;
      data.presets.splice(index,1);commit();render();return;
    }
    const action=btn.dataset.tmAction,now=Date.now();
    if(!action)return;
    if(action==='start'){
      const duration=readInputs();if(!duration){error();return;}
      unlockSound();data.countdown={phase:'running',durationMs:duration,remainingMs:duration,endAt:now+duration};
      lastDeadline=now+duration;
    }else if(action==='pause'){
      if(data.countdown.phase!=='running')return;
      const remaining=remainingCountdown(data.countdown,now);
      data.countdown=remaining?{...data.countdown,phase:'paused',remainingMs:Math.ceil(remaining/1000)*1000,endAt:null}:{...data.countdown,phase:'finished',remainingMs:0,endAt:null};
      data.countdown.remainingMs=Math.min(data.countdown.remainingMs,data.countdown.durationMs);
      lastDeadline=null;
    }else if(action==='continue'){
      if(data.countdown.phase!=='paused')return;
      unlockSound();data.countdown={...data.countdown,phase:'running',endAt:now+data.countdown.remainingMs};lastDeadline=data.countdown.endAt;
    }else if(action==='reset'){
      const duration=data.countdown.durationMs;
      data.countdown={phase:'idle',durationMs:duration,remainingMs:duration,endAt:null};
      input=timeParts(duration);lastDeadline=null;
    }else if(action==='save-preset'){
      const duration=readInputs();if(!duration){error();return;}
      const name=presetName.trim();
      if(!name||name.length>32){notify(t('timerInvalidName'));return;}
      if(data.presets.length>=MAX_PRESETS){notify(t('timerPresetLimit'));return;}
      if(data.presets.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase())){notify(t('timerDuplicateName'));return;}
      data.presets.push({id:uid().replace(/[^a-zA-Z0-9-]/g,'').slice(0,80),name,seconds:duration/1000});presetName='';
    }else if(action==='sw-start'){
      data.stopwatch={...data.stopwatch,phase:'running',startedAt:now-data.stopwatch.elapsedMs};
    }else if(action==='sw-pause'){
      if(data.stopwatch.phase!=='running')return;
      data.stopwatch={...data.stopwatch,phase:'paused',elapsedMs:stopwatchElapsed(data.stopwatch,now),startedAt:null};
    }else if(action==='sw-reset'){
      data.stopwatch={phase:'idle',elapsedMs:0,startedAt:null,laps:[]};
    }else if(action==='sw-lap'){
      const sw=data.stopwatch;
      if(sw.phase!=='running'||sw.laps.length>=MAX_LAPS)return;
      const elapsed=stopwatchElapsed(sw,now),previous=sw.laps.at(-1)||0;
      if(elapsed<=previous)return;
      sw.laps.push(elapsed);
    }else return;
    commit();render();
  };
  const onVisibility=()=>{
    if(document.visibilityState==='visible'){
      // Do not sound a delayed background alarm on reopen.
      lastDeadline=null;
      const settled=settleTimer(data);
      if(JSON.stringify(data)!==JSON.stringify(settled)){data=settled;commit();render();}
      else tick();
    }
  };
  element.addEventListener('input',onInput);
  element.addEventListener('click',onClick);
  document.addEventListener('visibilitychange',onVisibility);
  ticker=setInterval(tick,100);
  render();
  return async()=>{
    mounted=false;
    clearInterval(ticker);
    document.removeEventListener('visibilitychange',onVisibility);
    element.removeEventListener('input',onInput);
    element.removeEventListener('click',onClick);
    if(audioContext){try{await audioContext.close();}catch{/* optional */}}
    await storeQueue.catch(()=>{});
  };
}
