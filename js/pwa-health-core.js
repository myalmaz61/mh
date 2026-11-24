/** Pure PWA readiness checks (no claims about actual connectivity). */
export const PWA_CRITICAL_FILES = Object.freeze([
  'index.html','js/app.js','js/config.js','js/db.js',
  'js/notes.js','js/notes-draft-core.js',
  'js/backup-integrity-core.js','js/backup-guard-core.js',
  'js/weather.js','js/football.js'
]);
/** Verify a status reply before trusting its version. The active controller's
 * version must match the page bundle, not merely a cache in Cache Storage. */
export function readShellStatus(data){
  if(!data || data.type!=='SHELL_STATUS' || typeof data.version!=='string' ||
     !/^\d+\.\d+\.\d+$/.test(data.version) ||
     data.cacheName!==`myhub-shell-v${data.version}`)return null;
  return {version:data.version,cacheName:data.cacheName};
}
export function shellVersionState(pageVersion,controllerStatus,controlled){
  if(!controlled)return 'uncontrolled';
  if(!controllerStatus)return 'unknown';
  return controllerStatus.version===pageVersion?'matched':'different';
}
/** All critical app/backup resources must be cached before reporting success. */
export function pwaCriticalCoverage(results) {
  if (!Array.isArray(results) || results.length!==PWA_CRITICAL_FILES.length) {
    return {cached:0,total:PWA_CRITICAL_FILES.length,ready:false};
  }
  const cached=results.filter(Boolean).length;
  return {cached,total:PWA_CRITICAL_FILES.length,ready:cached===PWA_CRITICAL_FILES.length};
}
export function pwaAssessment(input){
  const supported=!!input?.supported;
  return {
    supported,
    controlled:supported&&!!input.controlled,
    waiting:supported&&!!input.waiting,
    shellCached:supported&&!!input.shellCached,
    offlineShellReady:supported&&!!input.controlled&&!!input.shellCached&&input.versionMatches!==false,
    onlineReported:!!input?.onlineReported
  };
}
