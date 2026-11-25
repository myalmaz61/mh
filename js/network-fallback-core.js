/** MyHub 7.1.0: ephemeral network feedback. Never treat navigator.onLine as proof of API reachability.
 * These labels describe cached data; they never alter persistent snapshots. */
export function networkFallbackKind({online=true,hasCache=false,issue='',loading=false}={}) {
  if(!online)return hasCache?'offlineSaved':'offlineEmpty';
  if(loading)return '';
  if(issue==='partial' && hasCache)return 'partialSaved';
  if(issue==='failed')return hasCache?'failedSaved':'failedEmpty';
  return '';
}

/** A provider can temporarily return a smaller fixture list. Keep all old
 * fixtures in the cache and explain the partial response to the user. */
export function footballResponseIssue(previousMatches,receivedMatches) {
  return Array.isArray(previousMatches) && previousMatches.length>0 &&
    Array.isArray(receivedMatches) && receivedMatches.length<previousMatches.length
    ? 'partial' : '';
}
