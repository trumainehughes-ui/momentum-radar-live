// Safe, zero-provider-call summarization of a signed checkpoint market response.
// Correlated sportsbook odds remain valid ONLY when the market builder actually
// verified the bookmaker-issued combined SGP quote.
export const NFL_CHECKPOINT_RESULT_STATES=new Set([
 'VERIFIED_BOOK_QUOTE','PROVIDER_SELECTIONS_UNQUOTED',
 'NO_PROVIDER_SELECTIONS','PROVIDER_EVENT_NOT_MATCHED',
 'PROVIDER_REQUEST_FAILED','PROVIDER_ODDS_UNAVAILABLE',
 'MARKET_REFRESH_UNAVAILABLE','MARKET_RESPONSE_UNVERIFIED',
 'DAILY_CHECKPOINT_BUDGET_EXHAUSTED','TOKEN_UNAVAILABLE',
 'TOKEN_STORE_UNAVAILABLE'
]);
const clamp=n=>Math.max(0,Math.min(1000,Math.floor(Number(n)||0)));
const VALID_STAGES=new Set(['DAY_AHEAD','FINAL_T_MINUS_30']);
const SAFE_REFRESH_STAGES=new Set(['initializing','snapshot_read','primary_book_provider','eligibility_and_roles','historical_stats','qb_depth_chart','matchup_context','td_matchup_model','projection_and_scoring','market_enrichment','sgp_eligibility','book_sgp_build','analytics_sgp_build','sgp_tier_assembly','sgp_pruning','outcome_profile','final_response','sportsbook_coverage','response_serialization']);
export function classifyNflCheckpointMarket(market){
 if(market?.ok!==true)return {status:'MARKET_RESPONSE_UNVERIFIED',
  nativeOfferRows:0,quoteCandidates:0,verifiedBookTiers:0};
 const debug=market.oddsDebug||{};
 const nativeOfferRows=clamp(debug.providerNativeRows);
 const quoteCandidates=clamp(debug.authorizedQuoteCandidates);
 const verifiedBookTiers=['DraftKings','FanDuel'].reduce((sum,book)=>
  sum+(Array.isArray(market.sgps?.[book])?
   market.sgps[book].filter(x=>x?.combinedBookQuoteVerified===true).length:0),0);
 let status='NO_PROVIDER_SELECTIONS';
 if(verifiedBookTiers>0&&market.sgps?.combinedBookQuoteVerified===true)
  status='VERIFIED_BOOK_QUOTE';
 else if(nativeOfferRows>0)status='PROVIDER_SELECTIONS_UNQUOTED';
 else if(debug.propLineStage==='event_not_matched')status='PROVIDER_EVENT_NOT_MATCHED';
 else if(debug.propLineStage==='provider_response_unavailable'||
   debug.propLineStage==='provider_unavailable')status='PROVIDER_REQUEST_FAILED';
 else if(debug.propLineStage==='no_current_verified_offers'||
   debug.propLineStage==='offers_filtered_out')status='PROVIDER_ODDS_UNAVAILABLE';
 const quoteRejections=Object.entries(debug)
  .filter(([key,value])=>/^(draftkings|fanduel)_(Small|Medium|Nuke)QuoteStatus$/.test(key)&&typeof value==='string')
  .map(([key,value])=>({tier:key.slice(0,-'QuoteStatus'.length),status:String(value).slice(0,70)}))
  .slice(0,6);
 return{status,nativeOfferRows,quoteCandidates,verifiedBookTiers,quoteRejections};
}
export function sanitizeNflCheckpointOutcome(value){
 if(!value||!NFL_CHECKPOINT_RESULT_STATES.has(value.status)||
   !VALID_STAGES.has(value.stage)||
   !/^\d{7,12}$/.test(String(value.gameId||'')))return null;
 return{gameId:String(value.gameId),status:value.status,stage:value.stage,
  nativeOfferRows:clamp(value.nativeOfferRows),
  quoteCandidates:clamp(value.quoteCandidates),
  verifiedBookTiers:clamp(value.verifiedBookTiers),
  quoteRejections:Array.isArray(value.quoteRejections)?
   value.quoteRejections.filter(x=>x&&/^(draftkings|fanduel)_(Small|Medium|Nuke)$/.test(String(x.tier))&&typeof x.status==='string')
    .slice(0,6).map(x=>({tier:x.tier,status:x.status.slice(0,70)})):[],
  refreshFailureStage:SAFE_REFRESH_STAGES.has(value.refreshFailureStage)?value.refreshFailureStage:null,
  refreshHttpStatus:Number.isInteger(value.refreshHttpStatus)&&value.refreshHttpStatus>=400&&value.refreshHttpStatus<=599?value.refreshHttpStatus:null};
}
