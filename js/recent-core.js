// Short tool history; no record titles, search text or content is stored.
import { TOOLS } from './config.js';
export const MAX_RECENT_TOOLS=5;
export function validRecentTools(value){
  return Array.isArray(value)&&value.length<=MAX_RECENT_TOOLS&&
    value.every(id=>typeof id==='string'&&TOOLS.some(t=>t.id===id))&&
    new Set(value).size===value.length;
}
export function advanceRecentTools(value,id){
  if(!validRecentTools(value))throw Error('Invalid recent tools');
  if(!TOOLS.some(tool=>tool.id===id))return [...value];
  return [id,...value.filter(x=>x!==id)].slice(0,MAX_RECENT_TOOLS);
}
