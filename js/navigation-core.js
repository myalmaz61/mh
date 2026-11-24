// MyHub v4.3 — browser history contains ONLY a route name and a scroll offset.
// Never place note text, record IDs, drafts or searches in URL/history state.
export const NAV_MARKER='myhub-navigation-v1';
export function safeScrollY(value){
  return Number.isFinite(value)&&value>=0 ? Math.min(Math.floor(value),1_000_000) : 0;
}
export function makeNavState(route,scrollY=0){
  if(typeof route!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(route))throw Error('Invalid route');
  return {myhubNavigation:NAV_MARKER,route,scrollY:safeScrollY(scrollY)};
}
export function readNavState(value,allowedRoutes){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.myhubNavigation!==NAV_MARKER)return null;
  if(!Array.isArray(allowedRoutes)||!allowedRoutes.includes(value.route))return null;
  if(typeof value.scrollY!=='number'||!Number.isFinite(value.scrollY)||value.scrollY<0||value.scrollY>1_000_000)return null;
  return makeNavState(value.route,value.scrollY);
}
export function shouldPushRoute(previous,next){
  return typeof previous==='string'&&typeof next==='string'&&previous!==next;
}
