/** v1.6: local-only order for All Tools. No tool or personal data is altered. */
import { TOOLS } from './config.js';
export const DEFAULT_TOOL_ORDER = Object.freeze(TOOLS.map(tool=>tool.id));
const ids = new Set(DEFAULT_TOOL_ORDER);
// These IDs existed when custom sorting first shipped. An archive from v1.6
// remains valid after future tools are added; newly added tools append to its order.
const V16_IDS = new Set([
  'calculator','clock','notes','weather','timer','calendar','tasks','quicklist',
  'football','rss','unit','datecalc','percentage','bookmarks','textcounter','random'
]);

export function validToolOrder(value) {
  return Array.isArray(value) && value.length>=V16_IDS.size && value.length<=DEFAULT_TOOL_ORDER.length &&
    value.every(id=>typeof id==='string' && ids.has(id)) &&
    new Set(value).size===value.length &&
    [...V16_IDS].every(id=>value.includes(id));
}

/** Repair an invalid local preference without losing any tools. */
export function normaliseToolOrder(value) {
  if(!Array.isArray(value))return [...DEFAULT_TOOL_ORDER];
  const result=[];
  const seen=new Set();
  for(const id of value){
    if(typeof id==='string' && ids.has(id) && !seen.has(id)){
      seen.add(id);
      result.push(id);
    }
  }
  for(const id of DEFAULT_TOOL_ORDER){if(!seen.has(id))result.push(id);}
  return result;
}

/** Move exactly one position, preserving the input array. */
export function moveToolOrder(order,id,direction) {
  if(!validToolOrder(order))throw Error('Invalid tool order');
  if(!ids.has(id))throw Error('Unknown tool');
  if(direction!=='up' && direction!=='down')throw Error('Invalid direction');
  const from=order.indexOf(id);
  const to=from+(direction==='up'?-1:1);
  if(to<0 || to>=order.length)return [...order];
  const next=[...order];
  [next[from],next[to]]=[next[to],next[from]];
  return next;
}

export function orderedTools(tools,order) {
  const byId=new Map(tools.map(tool=>[tool.id,tool]));
  return normaliseToolOrder(order).map(id=>byId.get(id)).filter(Boolean);
}
