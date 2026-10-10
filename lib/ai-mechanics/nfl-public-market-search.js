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

export function pickOfficialNflSearchResults(json,book,{now=Date.now()}={}){
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
   out.push({title:limit(r.title).slice(0,140)||"Official sportsbook page",
    url,description:limit(r.description).slice(0,350),
    book,discoveredAt:new Date(now).toISOString(),
    indexedSourceOnly:true,livePriceVerified:false,
    gamePlayerMarketVerified:false,combinedSgpQuoteVerified:false,
    price:null,sourceQuoteAt:null});
   if(out.length>=5)break;
  }catch{}
 }
 return out;
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
 return {ok:true,results:pickOfficialNflSearchResults(data,request.book,{now}),
  source:"Brave Search indexed web pages",
  quotedBookPricesVerified:0,combinedSgpQuotesVerified:0,
  liveOddsAvailable:false,advisoryOnly:true,
  message:"Search-index discovery only. Open official sportsbook pages to independently verify exact game, player, market, line and current +/− price."};
}
