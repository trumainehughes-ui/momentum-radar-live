// Circuit-breaker policy for NFL sportsbook providers.
// Never treat provider recovery as a verified current quote.
export const NFL_MARKET_HOLDS=Object.freeze({
 oddsMonthlyRecheckMs:24*60*60*1000,
 sgoDefaultMs:15*60*1000,
 sgoMonthlyRecheckMs:12*60*60*1000,
 sgoMaxRetryMs:6*60*60*1000
});
const number=x=>x===null||x===undefined||x===''?NaN:Number(x);
export function oddsMonthlyQuotaExhausted({code='',remaining=null,status=0}={}){
 const marker=String(code).toUpperCase();
 return marker.includes('OUT_OF_USAGE_CREDITS')||
   (Number(status)===401&&String(remaining)==='0');
}
export function sgoMonthlyQuotaExhausted(usage){
 const limits=usage?.rateLimits||usage?.rate_limits||{};
 for(const [period,value] of Object.entries(limits)){
  if(!/(month|30.day)/i.test(period)||!value||typeof value!=='object')continue;
  const max=number(value.maxEntitiesPerInterval??value.maxObjectsPerInterval);
  const current=number(value.currentIntervalEntities??value.currentIntervalObjects);
  if(Number.isFinite(max)&&max>0&&Number.isFinite(current)&&current>=max)return true;
 }
 return false;
}
export function sgoRateLimitHoldMs({retryAfterSeconds=0,usage=null}={}){
 if(sgoMonthlyQuotaExhausted(usage))return NFL_MARKET_HOLDS.sgoMonthlyRecheckMs;
 const seconds=number(retryAfterSeconds);
 const retry=Number.isFinite(seconds)&&seconds>0?seconds*1000:0;
 return Math.min(NFL_MARKET_HOLDS.sgoMaxRetryMs,
   Math.max(NFL_MARKET_HOLDS.sgoDefaultMs,retry));
}
