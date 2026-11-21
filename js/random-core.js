/** Web Crypto-powered, unbiased selection for bounded integer ranges. */
export const MIN_VALUE=-1_000_000_000;
export const MAX_VALUE=1_000_000_000;
const UINT32=4_294_967_296;

function crypto32(){
  if(!globalThis.crypto?.getRandomValues)throw Error('Secure random source unavailable');
  const value=new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0];
}
export function uniformIndex(size, random32=crypto32){
  if(!Number.isSafeInteger(size)||size<1||size>UINT32)throw Error('Invalid range');
  if(size===1)return 0;
  const limit=Math.floor(UINT32/size)*size;
  // Reject the last few 32-bit values to avoid modulo bias.
  for(let attempt=0;attempt<1_000_000;attempt++){
    const n=random32();
    if(!Number.isInteger(n)||n<0||n>=UINT32)throw Error('Invalid RNG');
    if(n<limit)return n%size;
  }
  throw Error('Random source did not provide a valid result');
}
export function randomNumbers({min,max,count=1,unique=false}, random32=crypto32){
  if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<MIN_VALUE||max>MAX_VALUE||min>max||
      !Number.isSafeInteger(count)||count<1||count>50||typeof unique!=='boolean')throw Error('Invalid number settings');
  const range=max-min+1;
  if(unique&&count>range)throw Error('Not enough unique values');
  if(!unique)return Array.from({length:count},()=>min+uniformIndex(range,random32));
  // Floyd's algorithm samples without replacement in O(count) memory.
  const selected=new Set();
  const result=[];
  for(let j=range-count;j<range;j++){
    const candidate=uniformIndex(j+1,random32);
    const chosen=selected.has(candidate)?j:candidate;
    selected.add(chosen);
    result.push(min+chosen);
  }
  return result;
}
export function parseChoices(source){
  if(typeof source!=='string'||source.length>20_000)throw Error('Invalid choices');
  const lines=source.split(/\r?\n/u).map(s=>s.trim()).filter(Boolean);
  if(lines.some(s=>s.length>200))throw Error('Option too long');
  const choices=[...new Set(lines)];
  if(choices.length<2||choices.length>100)throw Error('Use 2–100 distinct choices');
  return choices;
}
export function pickChoice(source, random32=crypto32){
  const choices=parseChoices(source);
  return choices[uniformIndex(choices.length,random32)];
}
