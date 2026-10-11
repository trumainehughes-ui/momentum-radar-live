import {propLineSgpLegSignature,propLineSgpLegsMatch} from './prop-line-sgp-leg-identity.js';
// Pure, fail-closed validation of PropLine's correlated SGP response.
// These are provider-reported bookmaker reference quotes, not placed bets.
// Do not infer a combined SGP price from individual player props.
const SPORT={nfl:'football_nfl',nba:'basketball_nba'};
const BOOKS=new Set(['draftkings','fanduel']);
const signature=leg=>{
 const market=String(leg?.market||leg?.market_key||'').trim();
 const id=String(leg?.book_outcome_id??'').trim();
 return market&&id?market+'|'+id:null;
};
export function verifyPropLineSgpResponse(request,payload,{now=Date.now()}={}){
 const reject=reason=>({quoted:false,reason,americanOdds:null,pricedAt:null,legsAccepted:0});
 const {league,bookmaker,eventId,legs}=request||{};
 if(!SPORT[league]||!BOOKS.has(bookmaker)||!/^[0-9]{1,14}$/.test(String(eventId||''))||
   !Array.isArray(legs)||legs.length<2||legs.length>10)return reject('INVALID_QUOTE_CONTEXT');
 const requested=legs.map(l=>league==='nfl'?propLineSgpLegSignature(l):signature(l));
 if(requested.some(x=>!x)||new Set(requested).size!==requested.length)
  return reject('DUPLICATE_OR_INCOMPLETE_REQUEST_LEGS');
 if(payload?.quoted!==true||payload?.redacted===true)
  return reject('PROVIDER_DECLINED_OR_REDACTED');
 // A returned price must identify the same book, event and exact selections.
 // If the upstream provider omits evidence, fail closed rather than guessing.
 if(String(payload.bookmaker||'').toLowerCase()!==bookmaker)
  return reject('QUOTE_BOOK_MISMATCH');
 // PropLine /sgp documents the top-level field as "id" (not "event_id").
 // Accept legacy aliases only if every supplied identifier agrees.
 const observedIds=[payload.id,payload.event_id,payload.event?.id]
  .filter(x=>x!==null&&x!==undefined&&String(x).trim()!=='')
  .map(x=>String(x));
 if(!observedIds.length||observedIds.some(x=>x!==String(eventId)))
  return reject('QUOTE_EVENT_MISMATCH');
 if(payload.sport_key&&payload.sport_key!==SPORT[league])
  return reject('QUOTE_LEAGUE_MISMATCH');
 const at=Date.parse(String(payload.priced_at||''));
 if(!Number.isFinite(now)||!Number.isFinite(at)||at>now||now-at>15*60*1000)
  return reject('QUOTE_STALE_OR_UNDATED');
 const odds=payload.sgp_price;
 if(!Number.isSafeInteger(odds)||odds<=0)return reject('QUOTE_PRICE_INVALID');
 if(!Array.isArray(payload.legs)||payload.legs.length!==requested.length)
  return reject('QUOTE_LEGS_MISMATCH');
 if(payload.legs.some(l=>l?.accepted!==true||
   (l.bookmaker&&String(l.bookmaker).toLowerCase()!==bookmaker)||
   (l.event_id&&String(l.event_id)!==String(eventId))))
  return reject('QUOTE_LEG_REJECTED_OR_WRONG_EVENT');
 if(league==='nfl'){
  // Native ids and exact outcome tuples may coexist. Never infer that a
  // provider-priced leg is the requested selection from its index alone.
  const matched=new Set();
  for(const leg of legs){
   const indexes=payload.legs.map((returned,i)=>
    !matched.has(i)&&propLineSgpLegsMatch(leg,returned)?i:-1)
    .filter(i=>i>=0);
   if(indexes.length!==1)return reject('QUOTE_LEGS_MISMATCH');
   matched.add(indexes[0]);
  }
  if(matched.size!==legs.length)return reject('QUOTE_LEGS_MISMATCH');
 }else{
  const quoted=payload.legs.map(signature);
  if(quoted.some(x=>!x)||new Set(quoted).size!==quoted.length||
     quoted.slice().sort().join('\n')!==requested.slice().sort().join('\n'))
   return reject('QUOTE_LEGS_MISMATCH');
 }
 return{quoted:true,reason:'PROVIDER_BOOK_COMBINED_PRICE_VALIDATED',americanOdds:odds,
  pricedAt:new Date(at).toISOString(),legsAccepted:legs.length};
}
