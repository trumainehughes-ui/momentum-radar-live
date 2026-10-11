// Decide whether a saved game-market model is fresh enough for this caller.
// Public UI traffic uses the existing 15-minute TTL; only the signed collector
// can demand a newer snapshot. A verified injury status change also bypasses.
export const NFL_RESPONSE_TTL_MS=15*60_000;
export const NFL_SIGNED_COLLECTOR_TARGET_MS=10*60_000;
const truthy=x=>/^(1|true)$/i.test(String(x||''));
export function signedNflCollectorLock(req,secret){
 return Boolean(secret&&req?.headers?.authorization==='Bearer '+secret&&
  truthy(req?.query?.lockRun));
}
export function shouldServeCachedNflMarkets(saved,req,{
 now=Date.now(),secret='',ttl=NFL_RESPONSE_TTL_MS
}={}){
 const age=now-Number(saved?.at);
 if(!saved||!Number.isFinite(age)||age<0||age>=ttl)
  return false;
 if(truthy(req?.query?.finalCheck))return false;
 const signed=Boolean(secret&&req?.headers?.authorization==='Bearer '+secret);
 if(signed&&truthy(req?.query?.verifiedChange))return false;
 // lockRun=1 in a public URL never bypasses the normal source budget.
 // A signed cron only rebuilds once its existing response is over ten
 // minutes old; concurrent or just-completed injury rebuilds can be reused.
 if(signedNflCollectorLock(req,secret)&&age>=NFL_SIGNED_COLLECTOR_TARGET_MS)
  return false;
 return true;
}
