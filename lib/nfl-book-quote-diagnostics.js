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
// Never return the provider's raw error text, even when the quote failed.
const SAFE_QUOTE_RESULTS=new Set([
 'PROVIDER_BOOK_COMBINED_QUOTE','BOOK_QUOTE_NOT_VERIFIED',
 'QUOTE_NOT_IN_REQUESTED_TIER_OR_INVALID','quote_provider_rejected',
 'quote_provider_unavailable','quote_already_attempted',
 'checkpoint_quote_budget_exhausted','change_token_invalid',
 'invalid_provider_response','quote_unavailable',
 'verified_book_selection_ids_or_exact_native_leg_required'
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
 const eligibleQuoteCandidates=bound(debug.authorizedQuoteCandidates);
 const rawAttempts=debug.authorizedQuoteAttempts;
 const quoteAttempts=Number.isSafeInteger(rawAttempts)&&rawAttempts>=0&&
  rawAttempts<=6?rawAttempts:null;
 const books=BOOKS.map(book=>{
  const cards=Array.isArray(raw.sgps?.[book])?raw.sgps[book]:[];
  const risks=RISKS.map(risk=>{
   const card=cards.find(c=>c?.risk===risk);
   const reason=String(card?.quoteEligibility||'');
   const result=String(debug[book.toLowerCase()+'_'+risk+'QuoteStatus']||'');
   return{risk,candidatePresent:Boolean(card&&card.legs?.length),
    selectionReadiness:REASONS.has(reason)?reason:
     card?'UNVERIFIED_PROVIDER_SELECTIONS':'NO_BOOK_CANDIDATE',
    quoteAttemptOutcome:authorizedRefreshObserved&&SAFE_QUOTE_RESULTS.has(result)?
     result:null,
    quoted:verified.some(q=>q.book===book&&q.risk===risk)};
  });
  return{book,risks};
 });
 let status='AWAITING_VERIFIED_CHANGE_EVENT';
 if(verified.length)status='VERIFIED_BOOK_QUOTES_PRESENT';
 else if(authorizedRefreshObserved){
  if(nativeOfferRows===0)status='AUTHORIZED_PROVIDER_OFFERS_UNAVAILABLE';
  else if(eligibleQuoteCandidates===0)status='NO_COMPLETE_PROVIDER_BOOK_TIER';
  else if(quoteAttempts===null)status='QUOTE_ATTEMPT_EVIDENCE_UNAVAILABLE';
  else if(quoteAttempts===0)status='QUOTE_NOT_ATTEMPTED';
  else status='BOOK_QUOTE_ATTEMPTED_UNVERIFIED';
 }
 return {status,nativeOfferRows,eligibleMarketRows,
  authorizedRefreshObserved,eligibleQuoteCandidates,
  quoteAttempts,books};
}
