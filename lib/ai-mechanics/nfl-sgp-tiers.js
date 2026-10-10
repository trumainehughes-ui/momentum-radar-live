// NFL SGP tier rules. Leg count is NOT a measure of payout risk.
// A bookmaker's *combined* price alone can confirm a payout tier;
// model picks without that quote are only composition-constrained candidates.
// +American odds: on a $10 stake, +1900 => $200 total return.
export const NFL_SGP_TIERS=Object.freeze({
 Small:Object.freeze({minOdds:1900,maxOdds:2900,maxTdLegs:1,minCategories:3,minYardageLegs:2,minYardageMarkets:2}),
 Medium:Object.freeze({minOdds:2900,maxOdds:7900,maxTdLegs:1,minCategories:3,minYardageLegs:3,minYardageMarkets:2}),
 Nuke:Object.freeze({minOdds:10000,maxOdds:Infinity,maxTdLegs:2,minCategories:3,minYardageLegs:3,minYardageMarkets:2})
});

export function classifyNflSgpOdds(americanOdds) {
 if(!Number.isFinite(americanOdds)||americanOdds<=0)return "UNKNOWN";
 if(americanOdds>=NFL_SGP_TIERS.Nuke.minOdds)return "Nuke";
 if(americanOdds>=NFL_SGP_TIERS.Small.minOdds&&americanOdds<=NFL_SGP_TIERS.Small.maxOdds)return "Small";
 if(americanOdds>NFL_SGP_TIERS.Medium.minOdds&&americanOdds<=NFL_SGP_TIERS.Medium.maxOdds)return "Medium";
 return "OUTSIDE_TIER_BANDS";
}

export function assessNflSgpTier({risk,legs=[],requiredLegs,
  estimatedOdds=null,combinedBookOdds=null}={}) {
 const tier=NFL_SGP_TIERS[risk];
 const picks=Array.isArray(legs)?legs:[];
 const count=Number.isSafeInteger(requiredLegs)&&requiredLegs>0?
   requiredLegs:picks.length;
 const categories=picks.map(x=>String(x?.cat||x?.category||"").toLowerCase());
 const distinct=new Set(categories.filter(Boolean));
 const tdCount=categories.filter(c=>c==="td").length;
 const yardageCategories=["passing","rushing","receiving"];
 const yards=picks.filter(x=>yardageCategories.includes(String(x?.cat||x?.category||"").toLowerCase()));
 const yardageMarkets=new Set(yards.map(x=>String(x?.cat||x?.category||"").toLowerCase()));
 const ids=picks.map(x=>String(x?.playerID||x?.playerId||"").trim()||
   String(x?.name||"").toUpperCase().replace(/[^A-Z0-9]/g,""));
 const duplicatePlayers=new Set(ids).size!==ids.length;
 const compositionOk=Boolean(tier&&picks.length===count&&count>=2&&
   !duplicatePlayers&&ids.every(Boolean)&&
   tdCount<=tier.maxTdLegs&&distinct.size>=tier.minCategories&&
   yards.length>=tier.minYardageLegs&&yardageMarkets.size>=tier.minYardageMarkets);
 // Independent leg multiplication is *never* bookmaker-correlated SGP odds.
 const estimatedBand=Number.isFinite(estimatedOdds)?
   classifyNflSgpOdds(estimatedOdds):null;
 const observedBand=Number.isFinite(combinedBookOdds)?
   classifyNflSgpOdds(combinedBookOdds):null;
 const status=!tier?"UNKNOWN_TIER":!compositionOk?
   "TIER_COMPOSITION_MISMATCH":observedBand&&observedBand!==risk?
   "ACTUAL_BOOK_PRICE_OUTSIDE_TIER":estimatedBand&&estimatedBand!==risk?
   "INDEPENDENT_ESTIMATE_OUTSIDE_TIER":"COMBINED_PRICE_UNVERIFIED";
 const reason=!tier?"Unsupported tier":
   !compositionOk?`${risk} requires ${tier.minYardageLegs}+ passing/rushing/receiving yardage legs across ${tier.minYardageMarkets}+ yardage markets, ${tier.minCategories}+ distinct prop markets, and at most ${tier.maxTdLegs} anytime TD; currently ${yards.length} yardage and ${tdCount} TD. Await valid yardage instead of substituting touchdowns.`:
   status==="ACTUAL_BOOK_PRICE_OUTSIDE_TIER"?
   `The observed combined bookmaker odds classify as ${observedBand}, not ${risk}; do not label this ${risk}.`:
   status==="INDEPENDENT_ESTIMATE_OUTSIDE_TIER"?
   `The independent-leg estimate falls outside ${risk}; actual combined sportsbook odds remain unverified.`:
   `${risk} composition candidate only. Exact sportsbook combined odds are unverified; the target return is not guaranteed.`;
 return {risk: String(risk||""),status,reason,compositionOk,
   tdLegs:tdCount,yardageLegs:yards.length,yardageMarketCount:yardageMarkets.size,
   marketCategories:[...distinct],
   requiredLegs:count,observedOddsCategory:observedBand,
   estimatedOddsCategory:estimatedBand,
   combinedBookQuoteVerified:false,tierVerified:false,
   modelOnly:true,advisoryOnly:true};
}
