// Shared warm-instance budget, deduplication and bounded result cache for
// optional Brave research. Not a durable multi-instance rate limiter.
// Only same game/player/team/market/book requests may share a response.
const sensibleInt=(n,fallback,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max?n:fallback;
export function makeNflSearchBroker({
 search,authorize=async()=>({allowed:false,reason:"search_budget_unconfigured"}),
 clock=()=>Date.now(),limitPerHour=20,
 cacheMs=10*60*1000,maxEntries=60
}={}){
 if(typeof search!=="function")throw new TypeError("search_function_required");
 if(typeof authorize!=="function")throw new TypeError("budget_authorizer_required");
 const limit=sensibleInt(limitPerHour,20,1,500);
 const ttl=sensibleInt(cacheMs,10*60*1000,1000,60*60*1000);
 const capacity=sensibleInt(maxEntries,60,5,1000);
 const inFlight=new Map(),recent=new Map(),buckets=new Map();
 const reply=(code,body)=>({code,body});
 const keyOf=r=>[r?.gameId,r?.player,r?.team,r?.market,r?.book].map(v=>String(v||"")).join("|");
 function trim(now){
   for(const [key,val] of recent)if(val.expires<=now)recent.delete(key);
   for(const [key] of recent)if(recent.size>capacity)recent.delete(key);
   for(const [key,val] of buckets)if(val.end<=now)buckets.delete(key);
   for(const [key] of buckets)if(buckets.size>capacity)buckets.delete(key);
 }
 return async function run({request,apiKey,clientId="unknown"}={}){
  if(!request||!apiKey)return reply(503,{ok:false,error:"search_not_configured"});
  const at=clock();
  if(!Number.isFinite(at))return reply(503,{ok:false,error:"search_clock_unavailable"});
  trim(at);
  const key=keyOf(request),cached=recent.get(key);
  if(cached&&cached.expires>at)
   return reply(200,{...cached.value,cached:true,deduplicated:true});
  const pending=inFlight.get(key);
  if(pending){
   const result=await pending;
   return reply(result.code,{...result.body,deduplicated:true});
  }
  const perClient=String(clientId||"unknown").slice(0,72);
  const bucketKey=perClient+"|"+Math.floor(at/3600000);
  const existing=buckets.get(bucketKey)?.count||0;
  if(existing>=limit)return reply(429,{ok:false,error:"research_budget_reached"});
  buckets.set(bucketKey,{count:existing+1,end:(Math.floor(at/3600000)+1)*3600000});
  const task=(async()=>{
   let budget;
   try{budget=await authorize({request,clientId:perClient,apiKey,now:at})}
   catch{return reply(503,{ok:false,error:"search_budget_unavailable"})}
   if(!budget?.allowed){
     const error=String(budget?.reason||"search_budget_unavailable");
     return reply(error==="search_global_budget_reached"||
       error==="search_client_budget_reached"?429:503,{ok:false,error});
   }
   let outcome;
   try{outcome=await search({request,apiKey,now:at})}
   catch{return reply(502,{ok:false,error:"search_provider_unavailable"})}
   if(!outcome?.ok){
    return reply(outcome?.error==="search_rate_limited"?429:
      outcome?.error==="search_not_configured"?503:502,
      {ok:false,error:outcome?.error||"search_provider_unavailable"});
   }
   const value={...outcome,book:request.book,market:request.market,
    player:request.player,team:request.team,gameId:request.gameId,
    cached:false,deduplicated:false};
   recent.set(key,{expires:at+ttl,value});
   trim(at);
   return reply(200,value);
  })();
  inFlight.set(key,task);
  try{return await task}
  finally{if(inFlight.get(key)===task)inFlight.delete(key)}
 };
}
