import {createHmac} from "node:crypto";

// Atomically enforces the total search *attempt* budget across all serverless
// instances. A failed/missing Redis connection DENIES a paid Brave lookup.
// No IPs or subscription tokens are persisted as Redis keys.
const POLICY_SCRIPT=[
  "local g = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local c = tonumber(redis.call('GET', KEYS[2]) or '0')",
  "if g >= tonumber(ARGV[1]) then return {0, 'global'} end",
  "if c >= tonumber(ARGV[2]) then return {0, 'client'} end",
  "g = redis.call('INCR', KEYS[1])",
  "if g == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) end",
  "c = redis.call('INCR', KEYS[2])",
  "if c == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3])) end",
  "return {1, g, c}"
].join("\n");
export const NFL_BRAVE_SHARED_POLICY={globalHourlyLimit:40,clientHourlyLimit:10};
export function configuredNflSearchBudget(env=process.env){
  const raw=String(env?.UPSTASH_REDIS_REST_URL||"");
  const token=String(env?.UPSTASH_REDIS_REST_TOKEN||"");
  if(!raw||!token)return false;
  try{
    const u=new URL(raw);
    return u.protocol==="https:"&&
      /^[a-z0-9-]+\.upstash\.io$/i.test(u.hostname)&&
      u.pathname==="/"&&!u.search&&!u.hash&&!u.username&&!u.password;
  }catch{return false}
}
export function makeNflSharedSearchAuthorizer({
 env=process.env,fetcher=fetch,clock=()=>Date.now()
}={}){
 return async function authorize({clientId="unknown",apiKey}={}){
  if(!configuredNflSearchBudget(env)||!apiKey)
    return {allowed:false,reason:"search_budget_unconfigured"};
  if(typeof fetcher!=="function")return {allowed:false,reason:"search_budget_unavailable"};
  const now=clock();
  if(!Number.isFinite(now)||now<0)return {allowed:false,reason:"search_budget_unavailable"};
  const hour=Math.floor(now/3600000);
  const hmac=createHmac("sha256",apiKey)
    .update(String(clientId||"unknown")).digest("hex").slice(0,32);
  const prefix="momentum:nfl:brave:v1:";
  const keys=[prefix+"global:"+hour,prefix+"client:"+hour+":"+hmac];
  const args=["EVAL",POLICY_SCRIPT,"2",...keys,
    String(NFL_BRAVE_SHARED_POLICY.globalHourlyLimit),
    String(NFL_BRAVE_SHARED_POLICY.clientHourlyLimit),
    "7200"];
  let response,payload;
  try{
    response=await fetcher(new URL("/",env.UPSTASH_REDIS_REST_URL).toString(),{
      method:"POST",redirect:"error",cache:"no-store",
      headers:{"Authorization":"Bearer "+env.UPSTASH_REDIS_REST_TOKEN,
       "Content-Type":"application/json"},
      body:JSON.stringify(args),signal:AbortSignal.timeout(5000)
    });
    if(!response?.ok)return {allowed:false,reason:"search_budget_unavailable"};
    payload=await response.json();
  }catch{return {allowed:false,reason:"search_budget_unavailable"}}
  // Fail closed on malformed Redis responses or error objects.
  const result=payload?.result;
  if(!Array.isArray(result)||result.length<2||![0,1].includes(result[0]))
    return {allowed:false,reason:"search_budget_unavailable"};
  if(result[0]===0)
    return {allowed:false,reason:result[1]==="global"?
      "search_global_budget_reached":"search_client_budget_reached"};
  if(!Number.isSafeInteger(result[1])||!Number.isSafeInteger(result[2])||
     result[1]<1||result[2]<1)return {allowed:false,reason:"search_budget_unavailable"};
  return {allowed:true,reason:"shared_budget_reserved"};
 };
}
