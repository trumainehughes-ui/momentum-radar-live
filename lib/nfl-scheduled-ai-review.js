// Day-ahead AI quality reviews use the already-saved, screened collector model.
// Never let a public page initiate AI, bookmaker spend or a collector write.
export const NFL_DAY_AHEAD_AI_COOLDOWN_MS=60*60*1000;
const meaningful=new Set(['FIRST_SNAPSHOT','INJURIES','LINEUPS','PLAYER_PROPS','SGP_TIERS','MATCHUP','MODEL_INPUTS']);
export function nflDayAheadAiReviewDue({
 stage,changedFields=[],prior=null,now=Date.now(),
 cooldownMs=NFL_DAY_AHEAD_AI_COOLDOWN_MS
}={}){
 if(stage!=='DAY_AHEAD_BUILD'||!Number.isFinite(now))return false;
 if(!Array.isArray(changedFields)||!changedFields.some(key=>meaningful.has(key)))
  return false;
 const lastAttempt=Date.parse(prior?.aiReviewAttemptAt||prior?.aiReview?.checkedAt||'');
 if(Number.isFinite(lastAttempt)&&lastAttempt>0&&now-lastAttempt>=0&&
    now-lastAttempt<cooldownMs)return false;
 return true;
}
