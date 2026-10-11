// Per-event SGP outcome report. Source-verified individual bookmaker props
// are NOT correlated parlay quotes. The target bands describe desired $10
// net profit, not the offered price of this candidate.
import {LEAGUE_SGP_TIERS,LEAGUE_SGP_BOOKS,
 LEAGUE_SGP_TARGETS,LEAGUE_SGP_LEG_BOUNDS} from './sgp-tier-contract.js';
import {validateAiSgpRules} from './sgp-ai-rule-guard.js';
import {nflOfferedOverThreshold} from './sgp-book-tier-targets.js';

const safe=x=>String(x??'').slice(0,96);
export function sgpBookRebuildReport({league,gameId,sgps}={}){
 if(!LEAGUE_SGP_LEG_BOUNDS[league]||!/^[0-9]{7,12}$/.test(String(gameId||'')))
  return{status:'INVALID_EVENT',league,gameId:String(gameId||''),tiers:[]};
 const tiers=LEAGUE_SGP_TIERS.map(risk=>{
  const target=LEAGUE_SGP_TARGETS[risk],books=LEAGUE_SGP_BOOKS.map(book=>{
   const card=(Array.isArray(sgps?.[book])?sgps[book]:[])
    .find(x=>x?.risk===risk);
   const legs=Array.isArray(card?.legs)?card.legs:[];
   const rule=validateAiSgpRules({league,risk,gameId,legs,
    requiredLegs:card?.requiredLegs??null});
   const matched=league==='nfl'&&Boolean(legs.length&&legs.every(l=>{
    const offer=l?.bookOffer,cat=safe(l?.cat||l?.category).toLowerCase();
    const sourceMatches=offer?.book===book&&offer.available!==false&&
     offer.odds!==null&&offer.odds!==undefined&&offer.odds!==''&&
     Number.isFinite(Number(offer.odds))&&Number(offer.odds)!==0;
    const min=nflOfferedOverThreshold(offer,cat);
    return sourceMatches&&min!==null&&
     (cat==='td'||Number(l.bookTierTarget??min)===min);
   }));
   const source=!card||card.modelDriven===true?'MODEL_FALLBACK_NOT_BOOK_MATCHED':
    !matched?'BOOK_LEGS_NOT_FULLY_VERIFIED':
    !rule.valid?'SGP_COMPOSITION_RULES_FAILED':
    'BOOK_LISTED_MODEL_CANDIDATE';
   const ready=source==='BOOK_LISTED_MODEL_CANDIDATE';
   const categoryCounts=Object.fromEntries([...new Set(legs.map(l=>safe(l.cat||l.category).toLowerCase()))]
    .map(cat=>[cat,legs.filter(l=>safe(l.cat||l.category).toLowerCase()===cat).length]));
   return{book,risk,modelLegCount:legs.length,
    requiredLegs:card?.requiredLegs??null,marketSourceStatus:source,
    ruleViolations:rule.rules||[],
    targetMinimumAmerican:target.minimum,targetMaximumAmerican:target.maximum,
    targetNetProfitOnTen:target.netProfitOnTen,
    bookListedLegsVerified:ready,
    tierConstruction:ready?safe(card.tierGeneration||'MODEL_SUPPORTED_OFFERED_LEGS'):null,
    statCategoryCounts:categoryCounts,
    actualCombinedOdds:null,combinedBookQuoteVerified:false,
    quotedPayoutWithinTier:false,bookableWagerConfirmed:false,
    nextAction:!legs.length?'BUILD_COMPLETE_BOOK_MODEL':
     !rule.valid?'REBUILD_TO_EXISTING_TIER_RULES':
     !matched?'RECHECK_EXACT_BOOK_MARKETS':'REQUEST_AUTHENTIC_CORRELATED_SGP_QUOTE',
    reason:ready?'Correctly sourced player legs and SGP construction rules; combined parlay price and target payout NOT verified.':
     safe(card?.reason)||'No complete verified sportsbook candidate for this game/tier.'
   };
  });
  return{risk,targets:target,books};
 });
 return{status:'MODEL_BOOK_REBUILD_NO_COMBINED_QUOTE',league,gameId:String(gameId),
  tiers,bookTierCount:tiers.reduce((n,t)=>n+t.books.length,0),
  individuallyListedTierCount:tiers.reduce((n,t)=>n+
   t.books.filter(b=>b.bookListedLegsVerified).length,0),
  bookQuoteVerifiedTierCount:0,
  allTierTargetsReached:false,
  note:'The AI ranks book-sourced candidate lines, never declares Small/Medium/Nuke payout achieved without authenticated combined sportsbook odds. No wager is placed.'};
}
