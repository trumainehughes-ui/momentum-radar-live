// AI-assisted Same Game Parlay recheck plans for every scheduled NFL/NBA
// game. Deterministic source evidence sets safe next steps. Groq can
// explain this plan on demand, but never creates a player offer, changes
// model weights, re-prices a ticket or alters a placed wager.
const RISK=Object.freeze(['Small','Medium','Nuke']);
const BOOK=Object.freeze(['DraftKings','FanDuel']);
const MAX_AGE=15*60*1000;
const bounds={nfl:{Small:[4,4],Medium:[5,5],Nuke:[5,7]},
 nba:{Small:[2,3],Medium:[3,5],Nuke:[5,7]}};
const safe=s=>String(s??'').slice(0,90);
const nonneg=n=>Number.isInteger(n)&&n>=0?n:null;
const fresh=(when,now)=>{const at=Date.parse(String(when||''));return Number.isFinite(at)&&at<=now&&now-at<=MAX_AGE;};
const results=(a,book,risk,gameId,legs)=>{
 const ok=a?.book===book&&a?.requestedTier===risk&&String(a?.gameId)===String(gameId)&&
  nonneg(a?.totalLegs)===legs&&nonneg(a?.matchedLegs)!==null&&a.matchedLegs<=legs;
 return ok?{matched:a.matchedLegs,total:legs,missing:Array.isArray(a.missingLegs)?a.missingLegs:[]}:null;
};
export function sgpAiRecheckPlan({
 league,gameId,sgps,sgpVerification,sourceCheckedAt,sourceAvailable=false,
 changedFields=[],now=Date.now()
}={}){
 if(!bounds[league]||!/^[0-9]{7,12}$/.test(String(gameId||'')))return{
  status:'INVALID_EVENT',gameId:safe(gameId),league:safe(league),tiers:[],
  canModifyPicks:false,canSetOdds:false,canPlaceWagers:false
 };
 const validScope=sgpVerification?.league===league&&String(sgpVerification?.gameId)===String(gameId);
 const marketFresh=sourceAvailable===true&&fresh(sourceCheckedAt,now);
 const model=league==='nfl'?sgps?.Analytics:sgps;
 const cards=Array.isArray(model)?model:[];
 const changes=(Array.isArray(changedFields)?changedFields:[])
  .filter(x=>['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','SPORTSBOOK_MARKETS'].includes(x));
 const tiers=RISK.map(risk=>{
  const card=cards.find(x=>x?.risk===risk),legs=Array.isArray(card?.legs)?card.legs:[],
   [min,max]=bounds[league][risk],tier=validScope?
    sgpVerification.tiers?.find(x=>x?.risk===risk):null;
  const ready=Boolean(tier?.modelStatus==='MODEL_CANDIDATE'&&legs.length>=min&&legs.length<=max);
  return{risk,modelStatus:ready?'MODEL_CANDIDATE':'NOT_READY',
   bookActions:BOOK.map(book=>{
    const audit=card?.bookMarketAudits?.[book],matching=results(audit,book,risk,gameId,legs.length);
    const verified=tier?.books?.[book];
    const bookStatus=validScope?safe(verified?.status||'NO_VERIFIED_BOOK_MARKETS'):'UNVERIFIED';
    const quoted=validScope&&verified?.tierVerified===true&&
     verified?.combinedOddsVerified===true&&fresh(verified?.quoteCheckedAt,now);
    const exact=ready&&marketFresh&&matching?.matched===legs.length&&
     verified?.status==='EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED';
    let action='REFRESH_AUTHORIZED_MARKETS';
    let reason='Fresh, matched market offers are required before quoting.';
    if(!ready){action='REBUILD_MODEL';reason='Tier model identity, injury, role or composition is not ready.';}
    else if(!marketFresh){action='REFRESH_AUTHORIZED_MARKETS';reason='No fresh authorized sportsbook prop data for this matchup.';}
    else if(!matching){action='MATCH_BOOK_PLAYER_PROPS';reason='This book has no complete verified per-leg audit for the current matchup.';}
    else if(matching.matched<matching.total){
     action='REVALIDATE_MISSING_LEGS';
     reason='One or more model thresholds are not currently confirmed at this book; re-evaluate before recomputing SGP.';
    }else if(quoted){
     action='QUOTE_WITHIN_TARGET_VERIFIED';reason='A recent matching, authenticated combined quote meets this tier; check availability again before placement.';
    }else if(exact||verified?.combinedOddsVerified===false&&matching.matched===matching.total){
     action='REQUEST_CORRELATED_BOOK_QUOTE';reason='Every individual selection is listed, but the sportsbook-issued combined SGP price is unverified.';
    }
    const suggestions=action==='REVALIDATE_MISSING_LEGS'?
     matching.missing.slice(0,5).map(m=>({
      player:safe(m.name),category:safe(m.category),
      requested:m.requested??null,
      observedOffers:(Array.isArray(m.listedOffers)?m.listedOffers:[]).slice(0,4)
       .map(o=>({display:safe(o.display),minimumToWin:o.minimumToWin??null})),
      applied:false,requiresUpdatedProjection:true
     })):[];
    return{book,action,reason,modelLegCount:legs.length,
     individuallyMatched:matching?.matched??null,
     requestedLegs:matching?.total??legs.length,
     observedBookStatus:bookStatus,observedQuoteVerified:quoted===true,
     suggestedLineRechecks:suggestions,
     changedEvidence:changes,canAutoApply:false,bookableWagerConfirmed:false};
   })};
 });
 const actions=tiers.flatMap(t=>t.bookActions);
 return{status:marketFresh?'SOURCE_SCOPED_RECHECK_PLAN':'MARKET_SOURCE_PENDING',
  league,gameId:String(gameId),checkedAt:new Date(now).toISOString(),
  marketEvidenceFresh:marketFresh,tiers,
  needsModelRebuild:actions.filter(a=>a.action==='REBUILD_MODEL').length,
  needsMarketRecheck:actions.filter(a=>a.action==='REVALIDATE_MISSING_LEGS').length,
  needsCombinedQuotes:actions.filter(a=>a.action==='REQUEST_CORRELATED_BOOK_QUOTE').length,
  observedQuoteTiers:actions.filter(a=>a.action==='QUOTE_WITHIN_TARGET_VERIFIED').length,
  evidenceChanges:changes,aiUsed:'DETERMINISTIC_SOURCE_CHECKS',
  canModifyPicks:false,canSetOdds:false,canPlaceWagers:false,
  note:'Advisory-only plan. Suggested alternate lines require new injury/role/matchup projections and an authorized combined sportsbook quote; not an accepted bet.'
 };
}
