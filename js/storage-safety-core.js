/** MyHub 6.8 — read-only browser storage and backup recency assessments.
 * navigator.storage.estimate() values are APPROXIMATE, origin-wide and not
 * the Android device's free disk space. Never delete, write or request permissions.
 */
export const MIB = 1024*1024;
export function assessOriginStorage(estimate){
  const usage=estimate?.usage,quota=estimate?.quota;
  if(!Number.isFinite(usage)||usage<0||!Number.isFinite(quota)||quota<=0||usage>quota)
    return {status:'unknown',used:null,quota:null,remaining:null,percent:null};
  const remaining=quota-usage,ratio=usage/quota;
  // A small reported quota is not itself evidence of pressure when empty.
  const meaningfulFree=quota>=100*MIB;
  const status=ratio>=0.9||(meaningfulFree&&remaining<10*MIB)?'high':
    ratio>=0.75||(meaningfulFree&&remaining<50*MIB)?'watch':'normal';
  return {status,used:usage,quota,remaining,percent:Math.round(ratio*100)};
}
export function assessBackupAge(iso,now=Date.now()){
  if(typeof iso!=='string'||!iso.trim()||!Number.isFinite(now))return {status:'unknown',days:null};
  const timestamp=Date.parse(iso);
  if(!Number.isFinite(timestamp))return {status:'unknown',days:null};
  const difference=now-timestamp;
  if(difference< -24*60*60*1000)return {status:'future',days:null};
  const days=Math.max(0,Math.floor(Math.max(0,difference)/86400000));
  return {status:days>=30?'old':days>=7?'aging':'recent',days};
}
/** Comparing counts is a *hint*, not proof that the content matches. */
export function compareNoteCounts(fileCount,localCount){
  if(!Number.isSafeInteger(fileCount)||fileCount<0||!Number.isSafeInteger(localCount)||localCount<0)
    return 'unknown';
  return fileCount===localCount?'equal':'different';
}
