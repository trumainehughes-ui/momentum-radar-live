import {classifyNflSgpOdds,tenDollarSgpPayout} from "./nfl-sgp-tiers.js";

// A source-controlled provider adapter must explicitly attest that the offer
// is the bookmaker-issued COMBINED price, not multiplied single-leg prices.
// Caller-provided screenshots, AI/search snippets and unsigned model data
// cannot set providerAuthenticated=true.
const BOOKS=new Set(["DraftKings","FanDuel"]);
const MARKETS=new Set(["td","passing","rushing","receiving","receptions"]);
const name=x=>String(x||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
const finitePositiveInt=x=>Number.isSafeInteger(x)&&x>0;
const normalizedLine=(leg)=>{
 const cat=String(leg?.cat||leg?.category||"");
 const raw=leg?.analyticsThreshold??leg?.threshold??leg?.line;
 if(cat==="td")return "ANYTIME TD";
 const val=Number(raw);
 return Number.isFinite(val)&&val>0?String(val):null;
};
const signature=leg=>{
 const cat=String(leg?.cat||leg?.category||"");
 const playerId=String(leg?.playerID||leg?.playerId||"").trim();
 const team=String(leg?.team||"").toUpperCase();
 const gameId=String(leg?.eventID||leg?.gameId||"");
 const line=normalizedLine(leg);
 if(!playerId||!name(leg?.name)||!team||!gameId||!MARKETS.has(cat)||!line)return null;
 return [gameId,team,playerId,name(leg.name),cat,line].join("|");
};
export function verifyNflBookCombinedSgpQuote({
 quote=null,gameId=null,book=null,legs=[],risk="Small",
 providerAuthenticated=false,now=Date.now(),maxAgeMs=15*60*1000
}={}){
 const fail=(reason)=>({verified:false,reason,actualCombinedOdds:null,
  actualNetProfit:null,actualTotalReturn:null,tierVerified:false});
 if(!providerAuthenticated)return fail("BOOK_SOURCE_NOT_AUTHENTICATED");
 if(!BOOKS.has(book)||!quote||quote.book!==book||
    quote.sourceType!=="BOOK_ISSUED_COMBINED_SGP")
   return fail("BOOK_COMBINED_PRICE_UNAVAILABLE");
 if(!gameId||String(quote.gameId)!==String(gameId))
   return fail("BOOK_GAME_ID_MISMATCH");
 const at=Date.parse(quote.sourceQuoteAt||"");
 if(!Number.isFinite(at)||!Number.isFinite(now)||
    at>now||now-at>maxAgeMs||maxAgeMs<1||maxAgeMs>15*60*1000)
   return fail("BOOK_COMBINED_PRICE_STALE");
 const offered=quote.americanOdds;
 if(!finitePositiveInt(offered))return fail("BOOK_COMBINED_PRICE_INVALID");
 const before=Array.isArray(legs)?legs:[],after=Array.isArray(quote.legs)?quote.legs:[];
 if(!before.length||before.length!==after.length)return fail("BOOK_LEGS_MISMATCH");
 const ids=before.map(signature),quoted=after.map(signature);
 if(ids.some(x=>!x)||quoted.some(x=>!x))return fail("BOOK_LEG_IDENTITY_INCOMPLETE");
 if(new Set(ids).size!==ids.length||new Set(quoted).size!==quoted.length)
   return fail("BOOK_DUPLICATE_LEGS");
 if(ids.slice().sort().join("\n")!==quoted.slice().sort().join("\n"))
   return fail("BOOK_LEGS_MISMATCH");
 const payout=tenDollarSgpPayout(offered);
 const observedBand=classifyNflSgpOdds(offered);
 const tierVerified=observedBand===risk;
 return {verified:true,reason:tierVerified?"BOOK_COMBINED_QUOTE_MATCHED":"BOOK_QUOTE_OUTSIDE_REQUESTED_TIER",
   book,gameId:String(gameId),sourceQuoteAt:new Date(at).toISOString(),
   actualCombinedOdds:offered,actualNetProfit:payout.netProfit,
   actualTotalReturn:payout.totalReturn,
   observedBand,tierVerified,
   stake:10,notGuaranteedAtPlacement:true};
}
