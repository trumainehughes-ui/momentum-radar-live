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
const norm=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const cat=x=>String(x?.cat||x?.category||'').toLowerCase();
const threshold=x=>cat(x)==='td'?'Anytime TD':
 Number(x?.analyticsThreshold??x?.threshold);
const sameLeg=(a,leg,gameId)=>a&&
 String(a.playerID||'')===String(leg?.playerID||leg?.playerId||'')&&
 String(a.eventID||'')===String(gameId)&&
 String(leg?.eventID||leg?.gameId||'')===String(gameId)&&
 norm(a.name)===norm(leg?.name)&&norm(a.team)===norm(leg?.team)&&
 a.category===cat(leg)&&a.requested===threshold(leg)&&
 typeof a.matched==='boolean';
// A count alone is not evidence that the audited prop/player/market matches
// every model leg. The server audit must prove exact ordered leg identities
// and self-consistent missing-line rows before requesting ANY combined quote.
const results=(a,book,risk,gameId,legs)=>{
 if(!a||a.book!==book||a.requestedTier!==risk||
  String(a.gameId)!==String(gameId)||!Array.isArray(legs)||
  nonneg(a.totalLegs)!==legs.length||nonneg(a.matchedLegs)===null||
  !Array.isArray(a.legs)||a.legs.length!==legs.length||
  !a.legs.every((row,i)=>sameLeg(row,legs[i],gameId)))return null;
 const actual=a.legs.filter(x=>x.matched).length;
 if(actual!==a.matchedLegs||a.allLegsMatched!==(actual===legs.length))return null;
 const missing=a.legs.filter(x=>!x.matched);
 if(!Array.isArray(a.missingLegs)||a.missingLegs.length!==missing.length||
  !a.missingLegs.every((x,i)=>sameLeg(x,legs[a.legs.indexOf(missing[i])],gameId)||
  x.matched===false))return null;
 return{matched:actual,total:legs.length,missing};
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
    const audit=card?.bookMarketAudits?.[book],matching=results(audit,book,risk,gameId,legs);
    const verified=tier?.books?.[book];
    const bookStatus=validScope?safe(verified?.status||'NO_VERIFIED_BOOK_MARKETS'):'UNVERIFIED';
    const exactAudit=ready&&marketFresh&&Boolean(matching&&
     matching.matched===legs.length);
    const quoted=exactAudit&&verified?.status==='TIER_COMBINED_QUOTE_VERIFIED'&&
     verified?.matchedLegs===legs.length&&verified?.requiredLegs===legs.length&&
     verified?.tierVerified===true&&verified?.combinedOddsVerified===true&&
     fresh(verified?.quoteCheckedAt,now);
    const exact=exactAudit&&
     verified?.status==='EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED'&&
     verified?.matchedLegs===legs.length&&verified?.requiredLegs===legs.length;
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
    }else if(exact){
     action='REQUEST_CORRELATED_BOOK_QUOTE';
     reason='Identity-verified individual selections match at this book. An authenticated combined SGP quote is still required.';
    }else if(exactAudit&&verified?.status==='BOOK_COMBINED_PRICE_OUTSIDE_TIER'&&
      verified?.combinedOddsVerified===true&&fresh(verified?.quoteCheckedAt,now)){
     action='REVIEW_OUT_OF_TIER_PRICE';
     reason='A fresh authenticated combined price exists but does not meet the requested payout tier. Do not reuse it as a qualifying ticket.';
    }else{
     action='MATCH_BOOK_PLAYER_PROPS';
     reason='Book line counts alone do not establish valid full-leg identity and bookmaker price readiness.';
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
