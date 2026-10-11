// Read-only, player-anonymized reasons a five-to-seven-leg Nuke may be unavailable.
// Inputs have already gone through game, roster and injury eligibility checks.
// No external calls, invented player markets, or gambling odds.
const YARDS=new Set(['passing','rushing','receiving']);
export function summarizeNflNukeEvidence(rows=[]){
 const all=Array.isArray(rows)?rows:[];
 const usable=all.filter(x=>x&&x.roleEligible===true&&x.ceilingSupported===true);
 const distinctAthletes=new Set(usable.map(x=>String(x.athleteId||'').trim()).filter(Boolean));
 const yardage=usable.filter(x=>YARDS.has(x.category));
 const yardageMarkets=new Set(yardage.map(x=>x.category));
 const markets=new Set(usable.map(x=>x.category).filter(Boolean));
 const summary={
  rosterCandidateRows:all.length,roleEligibleRows:all.filter(x=>x?.roleEligible===true).length,
  supportedCeilingRows:usable.length,uniqueEligibleAthletes:distinctAthletes.size,
  supportedYardageRows:yardage.length,distinctYardageMarkets:yardageMarkets.size,
  distinctMarkets:markets.size
 };
 let blocker='COMBINATION_OR_CEILING_SELECTION';
 if(summary.uniqueEligibleAthletes<5)blocker='FEWER_THAN_FIVE_ELIGIBLE_ATHLETES';
 else if(summary.supportedYardageRows<3)blocker='FEWER_THAN_THREE_SUPPORTED_YARDAGE_LEGS';
 else if(summary.distinctYardageMarkets<2)blocker='FEWER_THAN_TWO_YARDAGE_MARKETS';
 else if(summary.distinctMarkets<3)blocker='FEWER_THAN_THREE_MARKET_TYPES';
 return {...summary,blocker,advisoryOnly:true};
}
