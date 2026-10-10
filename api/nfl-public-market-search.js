import { makeOfficialNflMarketSearch,
 queryOfficialNflMarketSearch } from "../lib/ai-mechanics/nfl-public-market-search.js";

// Intentionally disabled until explicitly enabled with a server-side key.
// One sportsbook, one player, one market and ONE search request per click.
// Never touches DK/FD private endpoints, odds caches or SGP verification gates.
const hourlyCounts=new Map(),recent=new Map();
const LIMIT_PER_HOUR=20,SEARCH_CACHE_MS=10*60*1000;
function reply(res,code,data){
 res.setHeader("Cache-Control","private, no-store");
 return res.status(code).json(data);
}
const originAllowed=origin=>{
 if(!origin)return true;
 try{
  const u=new URL(origin),h=u.hostname;
  return u.protocol==="https:"&&
   (h==="momentum-radar-live.vercel.app"||
    h.endsWith(".momentum-radar-live.vercel.app")||
    h.endsWith("-trumainehughes-6743.vercel.app"));
 }catch{return false}
};
export default async function handler(req,res){
 if(req.method!=="POST")return reply(res,405,{ok:false,error:"method_not_allowed"});
 if(!originAllowed(req.headers?.origin))return reply(res,403,{ok:false,error:"origin_not_allowed"});
 if(process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED!=="true")
  return reply(res,503,{ok:false,error:"search_disabled",message:"NFL public web research requires explicit server-side enablement."});
 const key=process.env.BRAVE_SEARCH_API_KEY;
 if(!key)return reply(res,503,{ok:false,error:"search_not_configured",message:"Brave Search API key not configured in Vercel."});
 const body=req.body||{};
 if(typeof body!=="object"||Array.isArray(body)||!body)
  return reply(res,400,{ok:false,error:"invalid_body"});
 let size=0;try{size=JSON.stringify(body).length}catch{}
 if(!size||size>1500)return reply(res,400,{ok:false,error:"invalid_body"});
 const request=makeOfficialNflMarketSearch(body);
 if(!request)return reply(res,400,{ok:false,error:"invalid_market_lookup"});
 const now=Date.now();
 // Best effort protection on each warm function instance. Do NOT enable
 // broadly without a durable global budget; preview research only.
 const ip=String(req.headers?.["x-forwarded-for"]||"unknown")
   .split(",")[0].slice(0,65);
 const bucket=ip+"|"+Math.floor(now/3600000);
 const count=hourlyCounts.get(bucket)||0;
 if(count>=LIMIT_PER_HOUR)return reply(res,429,{ok:false,error:"research_budget_reached"});
 if(hourlyCounts.size>80)hourlyCounts.clear();
 const cacheKey=[request.gameId,request.player,request.team,request.market,request.book].join("|");
 const cached=recent.get(cacheKey);
 if(cached&&cached.expires>now)return reply(res,200,{
  ...cached.value,cached:true
 });
 hourlyCounts.set(bucket,count+1);
 const output=await queryOfficialNflMarketSearch({request,apiKey:key,now});
 if(!output.ok)return reply(res,output.error==="search_rate_limited"?429:502,output);
 if(recent.size>60)recent.clear();
 recent.set(cacheKey,{value:output,expires:now+SEARCH_CACHE_MS});
 return reply(res,200,{...output,book:request.book,market:request.market,
  player:request.player,team:request.team,gameId:request.gameId,cached:false});
}
