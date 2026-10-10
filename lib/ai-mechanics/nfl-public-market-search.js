import { assessNflIndexedPageRelevance } from "./nfl-indexed-page-relevance.js";

// Brave-powered discovery of OFFICIAL sportsbook pages, not live price capture.
// Controlled server-side Web Search only; no request to bookmaker sites.
// A URL/snippet from a search index cannot verify an offered market or odds.
export const OFFICIAL_NFL_BOOK_DOMAINS=Object.freeze({
 DraftKings:"sportsbook.draftkings.com",
 FanDuel:"sportsbook.fanduel.com"
});
export const NFL_MARKET_SEARCH_LABELS=Object.freeze({
 td:"anytime touchdown scorer",
 passing:"passing yards",
 rushing:"rushing yards",
 receiving:"receiving yards",
 receptions:"receptions"
});
const limit=x=>String(x||"").trim();
const cleanPlayer=x=>limit(x).replace(/\s+/g," ");
export function makeOfficialNflMarketSearch({gameId,player,team,market,book}={}){
 const host=OFFICIAL_NFL_BOOK_DOMAINS[book],
  label=NFL_MARKET_SEARCH_LABELS[market],name=cleanPlayer(player),
  abbr=limit(team).toUpperCase();
 if(!/^\d{5,15}$/.test(String(gameId||""))||!host||!label||
    name.length<4||name.length>70||
    !/^[\p{L}\p{M}\p{N}\s.'’\-]+$/u.test(name)||
    !/^[A-Z]{2,4}$/.test(abbr))
  return null;
 const q=`site:${host} "${name}" NFL "${label}" "${abbr}"`;
 return {gameId:String(gameId),player:name,team:abbr,market,book,
  q,domain:host,queryProvider:"Brave Search",count:5};
}

export function pickOfficialNflSearchResults(json,book,{now=Date.now(),request=null}={}){
 const host=OFFICIAL_NFL_BOOK_DOMAINS[book];
 if(!host||!Number.isFinite(now))return [];
 const out=[],seen=new Set();
 for(const r of Array.isArray(json?.web?.results)?json.web.results.slice(0,20):[]){
  try{
   const u=new URL(String(r?.url||""));
   // no subdomain aliases, redirects or URL shorteners accepted.
   if(u.protocol!=="https:"||u.hostname.toLowerCase()!==host||
      u.username||u.password||!u.pathname)continue;
   const url=u.toString().slice(0,1200);
   if(seen.has(url))continue;seen.add(url);
   const relevance=assessNflIndexedPageRelevance({
     title:r.title,description:r.description,pathname:u.pathname
   },request||{});
   // Without source-visible evidence of the requested player, a search
   // index hit is not a helpful player research link. Keep the market
   // unconfirmed rather than fabricating it from the query itself.
   if(request?.player&&!relevance.candidate)continue;
   out.push({title:limit(r.title).slice(0,140)||"Official sportsbook page",
    url,description:limit(r.description).slice(0,350),
    book,discoveredAt:new Date(now).toISOString(),
    relevance,matchLevel:relevance.matchLevel,
    indexedSourceOnly:true,livePriceVerified:false,
    gamePlayerMarketVerified:false,combinedSgpQuoteVerified:false,
    price:null,sourceQuoteAt:null});
   if(out.length>=5)break;
  }catch{}
 }
 return request?.player?out.sort((a,b)=>Number(b.relevance.marketMentioned)-Number(a.relevance.marketMentioned)):out;
}

export async function queryOfficialNflMarketSearch({
 request,apiKey,now=Date.now(),fetcher=fetch
}={}){
 if(!request||!apiKey)return {ok:false,error:"search_not_configured"};
 if(typeof fetcher!=="function")return {ok:false,error:"search_transport_missing"};
 const endpoint=new URL("https://api.search.brave.com/res/v1/web/search");
 endpoint.search=new URLSearchParams({
  q:request.q,count:String(request.count||5),country:"US",
  search_lang:"en",safesearch:"moderate"
 }).toString();
 let response;
 try{
  response=await fetcher(endpoint.toString(),{
   method:"GET",redirect:"error",
   headers:{Accept:"application/json","X-Subscription-Token":apiKey},
   cache:"no-store",signal:AbortSignal.timeout(7000)
  });
 }catch{return {ok:false,error:"search_provider_unavailable"}}
 if(!response?.ok){
  return {ok:false,error:response?.status===429?"search_rate_limited":
    response?.status===401||response?.status===403?"search_provider_auth_failed":
    "search_provider_unavailable"};
 }
 let data;
 try{data=await response.json()}catch{return{ok:false,error:"search_invalid_response"}}
 const results=pickOfficialNflSearchResults(data,request.book,{now,request});
 return {ok:true,results,playerMatchedResults:results.length,
  marketMentionedResults:results.filter(x=>x.relevance.marketMentioned).length,
  source:"Brave Search indexed web pages",
  quotedBookPricesVerified:0,combinedSgpQuotesVerified:0,
  liveOddsAvailable:false,advisoryOnly:true,
  message:"Search-index player mentions only. Market mentions are advisory; game/team identity and current offered line, price and combined SGP odds remain independently unverified."};
}
