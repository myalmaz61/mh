import {parseQuantity} from './unit-core.js';
export const PERCENT_OPERATIONS=['of','what','change','increase','decrease','vatAdd','vatRemove'];
export function calculatePercent(operation,first,second){
  if(!PERCENT_OPERATIONS.includes(operation))throw Error('Invalid operation');
  const a=parseQuantity(first),b=parseQuantity(second);
  let result;
  switch(operation){
    case 'of':result=a*b/100;break; // a percent of b
    case 'what':if(b===0)throw Error('Cannot divide by zero');result=a/b*100;break;
    case 'change':if(a===0)throw Error('Starting value cannot be zero');result=(b-a)/Math.abs(a)*100;break;
    case 'increase':result=a*(1+b/100);break;
    case 'decrease':result=a*(1-b/100);break;
    case 'vatAdd':if(b<0||b>100)throw Error('Invalid tax rate');result=a*(1+b/100);break;
    case 'vatRemove':if(b<0||b>100)throw Error('Invalid tax rate');result=a/(1+b/100);break;
  }
  if(!Number.isFinite(result)||Math.abs(result)>1e21)throw Error('Result out of range');
  return Math.abs(result)<1e-12?0:result;
}
