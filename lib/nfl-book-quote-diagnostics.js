// Read-only, bounded diagnosis of saved NFL bookmaker-pricing evidence.
// Never call a sportsbook or expose API keys, athletes, native selection IDs
// or raw upstream error bodies. This is NOT a quote and is not bettable.
const REASONS=new Set([
 'READY_FOR_AUTHORIZED_QUOTE','INVALID_QUOTE_GAME_OR_TIER',
 'INCOMPLETE_OR_UNQUALIFIED_BOOK_TIER','MISSING_PROPLINE_BOOK_OFFER',
 'CROSS_GAME_BOOK_SELECTIONS','MISSING_VERIFIED_BOOK_SELECTIONS',
 'MISSING_PROVIDER_EVENT_ID','STALE_OR_UNDATED_BOOK_SELECTION',
 'MISSING_BOOK_OFFER_PRICE','DUPLICATE_BOOK_SELECTION',
 'CROSS_PROVIDER_EVENT_SELECTIONS'
]);
const BOOKS=['DraftKings','FanDuel'];
const RISKS=['Small','Medium','Nuke'];
const bound=x=>Math.max(0,Math.min(10000,Math.floor(Number(x)||0)));
export function nflSavedBookQuoteDiagnostics(raw,{
 fresh=false,verifiedQuotes=[]
}={}){
 if(!fresh||raw?.ok!==true)return{
  status:'STALE_OR_UNVERIFIED_MODEL',nativeOfferRows:0,
  eligibleMarketRows:0,authorizedRefreshObserved:false,
  quoteAttempts:0,books:[]
 };
 const debug=raw.oddsDebug||{},nativeOfferRows=bound(debug.providerNativeRows);
 const eligibleMarketRows=bound(raw.validation?.sgpEligibleMarketRows);
 const authorizedRefreshObserved=Boolean([
  'player_injury','player_inactive','scheduled_checkpoint','qb_change',
  'offense_change','defense_change','depth_chart_change'
 ].includes(debug.propLineChangeType));
 const verified=Array.isArray(verifiedQuotes)?verifiedQuotes:[];
 const books=BOOKS.map(book=>{
  const cards=Array.isArray(raw.sgps?.[book])?raw.sgps[book]:[];
  const risks=RISKS.map(risk=>{
   const card=cards.find(c=>c?.risk===risk);
   const reason=String(card?.quoteEligibility||'');
   return{risk,candidatePresent:Boolean(card&&card.legs?.length),
    selectionReadiness:REASONS.has(reason)?reason:
     card?'UNVERIFIED_PROVIDER_SELECTIONS':'NO_BOOK_CANDIDATE',
    quoted:verified.some(q=>q.book===book&&q.risk===risk)};
  });
  return{book,risks};
 });
 const quoteAttempts=bound(debug.authorizedQuoteCandidates);
 let status='AWAITING_VERIFIED_CHANGE_EVENT';
 if(verified.length)status='VERIFIED_BOOK_QUOTES_PRESENT';
 else if(authorizedRefreshObserved){
  if(nativeOfferRows===0)status='AUTHORIZED_PROVIDER_OFFERS_UNAVAILABLE';
  else if(quoteAttempts===0)status='NO_COMPLETE_PROVIDER_BOOK_TIER';
  else status='BOOK_QUOTE_ATTEMPTED_UNVERIFIED';
 }
 return {status,nativeOfferRows,eligibleMarketRows,
  authorizedRefreshObserved,quoteAttempts,books};
}
