// Durable provider cooldown policy. Cross-request state is written by the
// server via Vercel Blob; no API keys or customer data ever enter these records.
const PROVIDERS=new Set(["sports-game-odds","the-odds-api"]);
export const ODDS_CREDITS_COOLDOWN_MS=6*60*60*1000;
export const SGO_RATE_COOLDOWN_MS=15*60*1000;
export const CIRCUIT_VERSION=1;
export function providerCircuit({provider,reason,now,backoffMs}={}){
 if(!PROVIDERS.has(provider)||!["quota_exhausted","rate_limited"].includes(reason)||
    !Number.isFinite(now)||!Number.isFinite(backoffMs)||backoffMs<=0)
   return null;
 // Never persist upstream messages: may contain user data or credentials.
 return {version:CIRCUIT_VERSION,provider,reason,at:now,
   blockedUntil:now+Math.min(24*60*60*1000,Math.max(60000,backoffMs))};
}
export function activeProviderCircuit(record,provider,now){
 if(!record||record.version!==CIRCUIT_VERSION||record.provider!==provider||
    !PROVIDERS.has(provider)||!["quota_exhausted","rate_limited"].includes(record.reason)||
    !Number.isFinite(record.at)||!Number.isFinite(record.blockedUntil)||
    !Number.isFinite(now)||record.at>now||record.blockedUntil<=now||
    record.blockedUntil-record.at>24*60*60*1000||
    record.blockedUntil-record.at<60000)return null;
 return {provider,reason:record.reason,blockedUntil:record.blockedUntil,
   retryAfterSeconds:Math.ceil((record.blockedUntil-now)/1000)};
}
export function providerCircuitError(record,provider,now){
 const active=activeProviderCircuit(record,provider,now);
 if(!active)return null;
 const err=new Error(provider+"_provider_"+active.reason+"_cooldown");
 err.retryAfterSeconds=active.retryAfterSeconds;
 err.providerUnavailable=true;
 return err;
}
export function isProviderQuotaExhaustion(code,remaining){
 return /OUT_OF_USAGE_CREDITS|quota.exhausted|insufficient.credits/i.test(String(code||"")) ||
    (remaining!==null&&remaining!==undefined&&String(remaining)==="0");
}
