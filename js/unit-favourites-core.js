// MyHub v1.4 — small, offline-only list of favourite conversion pairs.
// Stores units, not entered measurements or personal data.
import { UNIT_GROUPS } from './unit-core.js';
export const MAX_UNIT_FAVOURITES=12;
export function emptyUnitFavourites(){return {schema:1,pairs:[]};}
export function validUnitPair(pair){
  if(!pair||typeof pair!=='object'||Array.isArray(pair)||
    typeof pair.category!=='string'||typeof pair.from!=='string'||typeof pair.to!=='string')return false;
  if(!Object.hasOwn(UNIT_GROUPS,pair.category))return false;
  const group=UNIT_GROUPS[pair.category];
  return !!group&&pair.from!==pair.to&&group.units.some(u=>u[0]===pair.from)&&group.units.some(u=>u[0]===pair.to);
}
export function unitPairKey(pair){return `${pair.category}\u0000${pair.from}\u0000${pair.to}`;}
export function validUnitFavourites(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.schema!==1||!Array.isArray(data.pairs)||data.pairs.length>MAX_UNIT_FAVOURITES)return false;
  const keys=new Set();
  for(const pair of data.pairs){
    if(!validUnitPair(pair))return false;
    const key=unitPairKey(pair);
    if(keys.has(key))return false;
    keys.add(key);
  }
  return true;
}
export function toggleUnitFavourite(data,pair){
  if(!validUnitFavourites(data)||!validUnitPair(pair))throw Error('Invalid unit favourites');
  const key=unitPairKey(pair);
  const found=data.pairs.some(item=>unitPairKey(item)===key);
  if(!found&&data.pairs.length>=MAX_UNIT_FAVOURITES)throw Error('Unit favourite limit');
  const pairs=found?data.pairs.filter(item=>unitPairKey(item)!==key):[...data.pairs,{category:pair.category,from:pair.from,to:pair.to}];
  return {schema:1,pairs};
}
