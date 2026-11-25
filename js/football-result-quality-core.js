/** MyHub v7.3.0 — conservative OpenLigaDB result selection.
 * OpenLigaDB publishes resultTypeKind (After90Minutes/AfterExtraTime/
 * AfterPenalties/HalfTime/Unknown). The older resultTypeID convention
 * is a fallback ONLY for responses without explicit kind metadata.
 * No additional API request and no stored-data migration are necessary.
 */
const finiteScore = value => Number.isInteger(value) && value >= 0 && value <= 100;
const pair = row => finiteScore(row?.pointsTeam1) && finiteScore(row?.pointsTeam2)
  ? [row.pointsTeam1,row.pointsTeam2] : null;

function chooseFinishedResult(rows) {
  const stageOrder = [
    ['AfterPenalties','after-penalties'],
    ['AfterExtraTime','after-extra'],
    ['After90Minutes','regulation'],
  ];
  for (const [kind,basis] of stageOrder) {
    const selected=rows.find(row=>row?.resultTypeKind===kind && pair(row));
    if(selected)return {scores:pair(selected),basis};
  }
  // In older leagues the slot is commonly resultTypeID=2. Never use
  // the maximum order blindly: that might be only a half-time score.
  const legacy=rows.find(row=>{
    if(row?.resultTypeKind!=null && row.resultTypeKind!=='' )return false;
    if(!pair(row))return false;
    const name=typeof row.resultName==='string'?row.resultName.trim().toLowerCase():'';
    if(/halbzeit|half.?time|pause|first half/.test(name))return false;
    return row.resultTypeID===2 || /^(endergebnis|full.?time|full.?time result|final result)$/.test(name);
  });
  return legacy?{scores:pair(legacy),basis:'legacy'}:null;
}

function lastPublishedGoal(goals){
  if(!Array.isArray(goals))return null;
  // ScoreTeam values, not the number of goals, are the published score.
  // Prefer the latest documented minute over an arbitrary array position.
  const valid=goals.filter(g=>finiteScore(g?.scoreTeam1)&&finiteScore(g?.scoreTeam2));
  if(!valid.length)return null;
  const minute=g=>Number.isInteger(g?.matchMinute)&&g.matchMinute>=0&&g.matchMinute<=200?g.matchMinute:-1;
  const chosen=valid.reduce((best,g)=>minute(g)>=minute(best)?g:best);
  return [chosen.scoreTeam1,chosen.scoreTeam2];
}

/** Returns an explicit score basis for extra-time or penalty scores only.
 * In-progress scores derived from goals are never claimed as final.
 * Completed fixtures with only HalfTime/Unknown data remain unconfirmed.
 */
export function openLigaPublishedScore(item){
  if(item?.matchIsFinished===true){
    const rows=Array.isArray(item?.matchResults)?item.matchResults:[];
    const result=chooseFinishedResult(rows);
    if(!result)return {homeScore:null,awayScore:null,scoreBasis:null};
    return {homeScore:result.scores[0],awayScore:result.scores[1],
      scoreBasis:result.basis==='after-penalties'||result.basis==='after-extra'?result.basis:null};
  }
  const goals=lastPublishedGoal(item?.goals);
  return {homeScore:goals?.[0]??null,awayScore:goals?.[1]??null,scoreBasis:null};
}
