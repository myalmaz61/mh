/** v1.5: pure functions for hiding shortcuts, never deleting module data. */
import { TOOLS } from './config.js';
const ids=new Set(TOOLS.map(tool=>tool.id));
export function validHiddenTools(value){
  return Array.isArray(value) && value.length<=TOOLS.length &&
    value.every(id=>typeof id==='string' && ids.has(id)) &&
    new Set(value).size===value.length;
}
export function normaliseHiddenTools(value){
  if(!Array.isArray(value))return [];
  return [...new Set(value.filter(id=>typeof id==='string' && ids.has(id)))].slice(0,TOOLS.length);
}
export function visibleTools(tools,hidden){
  const hiddenSet=new Set(validHiddenTools(hidden)?hidden:[]);
  return tools.filter(tool=>!hiddenSet.has(tool.id));
}
export function toggleToolHidden(hidden,id){
  if(!validHiddenTools(hidden))throw Error('Invalid hidden-tools preference');
  if(!ids.has(id))throw Error('Unknown tool');
  return hidden.includes(id)?hidden.filter(item=>item!==id):[...hidden,id];
}
