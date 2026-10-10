import { makeOfficialNflMarketSearch,
 queryOfficialNflMarketSearch } from "../lib/ai-mechanics/nfl-public-market-search.js";
import { makeNflSearchBroker } from "../lib/ai-mechanics/nfl-search-broker.js";
import { makeNflSharedSearchAuthorizer, configuredNflSearchBudget } from "../lib/ai-mechanics/nfl-shared-search-budget.js";

// Intentionally disabled until explicitly enabled with a server-side key.
// One sportsbook, one player, one market and ONE search request per click.
// Never touches DK/FD private endpoints, odds caches or SGP verification gates.
const runSearch=makeNflSearchBroker({search:queryOfficialNflMarketSearch,
 authorize:makeNflSharedSearchAuthorizer()});
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
 if(!configuredNflSearchBudget())return reply(res,503,{ok:false,error:"search_budget_unconfigured",message:"Cross-instance search budget is not connected; no paid searches were attempted."});
 const body=req.body||{};
 if(typeof body!=="object"||Array.isArray(body)||!body)
  return reply(res,400,{ok:false,error:"invalid_body"});
 let size=0;try{size=JSON.stringify(body).length}catch{}
 if(!size||size>1500)return reply(res,400,{ok:false,error:"invalid_body"});
 const request=makeOfficialNflMarketSearch(body);
 if(!request)return reply(res,400,{ok:false,error:"invalid_market_lookup"});
 const ip=String(req.headers?.["x-forwarded-for"]||"unknown")
   .split(",")[0].slice(0,65);
 const result=await runSearch({request,apiKey:key,clientId:ip});
 return reply(res,result.code,result.body);
}
