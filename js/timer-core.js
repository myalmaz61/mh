/** MyHub timer math and backup validation. No browser timers or external dependencies. */
export const MAX_TIMER_MS = 86_399_000; // 23:59:59
export const MAX_STOPWATCH_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_LAPS = 80;
export const MAX_PRESETS = 12;
const PRESETS = Object.freeze([
  {id:'default-5',name:'5 min',seconds:300},
  {id:'default-10',name:'10 min',seconds:600},
  {id:'default-25',name:'25 min',seconds:1500},
]);
const int=(v,min,max)=>Number.isSafeInteger(v) && v>=min && v<=max;
const goodTime=t=>int(t,0,8_640_000_000_000_000);

export function defaultTimerData(){
  return {
    version:1,
    countdown:{phase:'idle',durationMs:300_000,remainingMs:300_000,endAt:null},
    stopwatch:{phase:'idle',elapsedMs:0,startedAt:null,laps:[]},
    presets:PRESETS.map(x=>({...x})),
  };
}

/** Validate untrusted JSON strictly; do not silently accept partially corrupt backups. */
export function validTimerData(data){
  if(!data || typeof data!=='object' || Array.isArray(data) || data.version!==1)return false;
  const c=data.countdown, s=data.stopwatch, p=data.presets;
  if(!c || !s || !Array.isArray(p) || p.length>MAX_PRESETS)return false;
  if(!['idle','running','paused','finished'].includes(c.phase) ||
     !int(c.durationMs,1000,MAX_TIMER_MS) || !int(c.remainingMs,0,c.durationMs))return false;
  if(c.phase==='running'){
    if(!goodTime(c.endAt) || c.remainingMs===0)return false;
  }else if(c.endAt!==null)return false;
  if(c.phase==='idle' && c.remainingMs!==c.durationMs)return false;
  if(c.phase==='finished' && c.remainingMs!==0)return false;
  if(c.phase==='paused' && c.remainingMs===0)return false;
  if(!['idle','running','paused'].includes(s.phase) || !int(s.elapsedMs,0,MAX_STOPWATCH_MS) ||
     !Array.isArray(s.laps) || s.laps.length>MAX_LAPS)return false;
  if((s.phase==='running' && !goodTime(s.startedAt)) ||
     (s.phase!=='running' && s.startedAt!==null))return false;
  if(s.phase==='idle' && (s.elapsedMs!==0 || s.laps.length))return false;
  let prev=0;
  for(const lap of s.laps){
    if(!int(lap,1,MAX_STOPWATCH_MS) || lap<=prev)return false;
    if(s.phase!=='running' && lap>s.elapsedMs)return false;
    prev=lap;
  }
  const ids=new Set(),names=new Set();
  for(const preset of p){
    if(!preset || typeof preset!=='object'||Array.isArray(preset)||
       typeof preset.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(preset.id) ||
       typeof preset.name!=='string' || !preset.name.trim() || preset.name.length>32 ||
       !int(preset.seconds,1,86_399))return false;
    const name=preset.name.trim().toLocaleLowerCase();
    if(ids.has(preset.id)||names.has(name))return false;
    ids.add(preset.id); names.add(name);
  }
  return true;
}
export function normaliseTimerData(input){
  return validTimerData(input) ? structuredClone(input) : defaultTimerData();
}
export function remainingCountdown(countdown, now=Date.now()){
  if(countdown.phase==='running')return Math.max(0,Math.min(countdown.durationMs,countdown.endAt-now));
  return countdown.remainingMs;
}
export function stopwatchElapsed(stopwatch, now=Date.now()){
  if(stopwatch.phase==='running')return Math.min(MAX_STOPWATCH_MS,Math.max(0,now-stopwatch.startedAt));
  return stopwatch.elapsedMs;
}
/** Auto-complete elapsed timers on return to the app, without firing a late alarm. */
export function settleTimer(data,now=Date.now()){
  const updated=structuredClone(data);
  if(updated.countdown.phase==='running' && remainingCountdown(updated.countdown,now)===0){
    updated.countdown={...updated.countdown,phase:'finished',remainingMs:0,endAt:null};
  }
  if(updated.stopwatch.phase==='running' && stopwatchElapsed(updated.stopwatch,now)>=MAX_STOPWATCH_MS){
    updated.stopwatch={...updated.stopwatch,phase:'paused',elapsedMs:MAX_STOPWATCH_MS,startedAt:null};
  }
  return updated;
}
/** Archived running sessions are frozen, so restoring an old backup does not restart an obsolete alarm. */
export function snapshotTimerForBackup(data,now=Date.now()){
  const clean=settleTimer(data,now);
  const c=clean.countdown,s=clean.stopwatch;
  if(c.phase==='running'){
    c.remainingMs=Math.max(1,Math.ceil(remainingCountdown(c,now)/1000)*1000);
    c.remainingMs=Math.min(c.durationMs,c.remainingMs);
    c.endAt=null;c.phase='paused';
  }
  if(s.phase==='running'){
    s.elapsedMs=stopwatchElapsed(s,now);
    s.startedAt=null;s.phase='paused';
  }
  return clean;
}
export function formatDuration(ms,{hundredths=false}={}){
  const positive=Math.max(0,Math.floor(ms));
  const totalSeconds=Math.floor(positive/1000);
  const h=Math.floor(totalSeconds/3600);
  const m=Math.floor(totalSeconds%3600/60);
  const sec=totalSeconds%60;
  const base=[h,m,sec].map(n=>String(n).padStart(2,'0')).join(':');
  return hundredths?base+'.'+String(Math.floor(positive%1000/10)).padStart(2,'0'):base;
}
