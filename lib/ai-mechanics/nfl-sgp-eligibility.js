// Defensive, last-mile NFL injury/inactive filter for all SGP surfaces.
// This is intentionally separate from the earlier player-pool filtering:
// an injury update between selection and rendering must invalidate pricing,
// completeness and book verification for the entire changed candidate.
const norm=x=>String(x??"").toUpperCase().replace(/[^A-Z0-9]/g,"");

export function pruneNflSgpsForEligibility(sgps,eligibility) {
  if (!sgps || typeof sgps!=="object") return {};
  if (eligibility?.checked!==true) return sgps;
  const blockedIds=eligibility.blockedIds instanceof Set ? eligibility.blockedIds : new Set();
  const blockedNames=eligibility.blockedNames instanceof Set ? eligibility.blockedNames : new Set();
  const blocked=leg=>{
    const id=String(leg?.playerID??leg?.playerId??"");
    const name=norm(leg?.name);
    return Boolean((id&&blockedIds.has(id))||(name&&blockedNames.has(name)));
  };
  const output={};
  for(const [channel,sets] of Object.entries(sgps)){
    if(!Array.isArray(sets)){output[channel]=sets;continue}
    output[channel]=sets.map(sgp=>{
      if(!sgp||typeof sgp!=="object")return null;
      const original=Array.isArray(sgp.legs)?sgp.legs:[];
      const legs=original.filter(leg=>!blocked(leg));
      const removed=original.length-legs.length;
      if(!removed)return sgp;
      const reason="Lineup/injury update removed "+removed+
        " ineligible leg"+(removed===1?"":"s")+
        ". The old parlay, combined price and payout target are invalid; regenerate and recheck all legs.";
      return {...sgp,legs,
        eligibilityPruned:true,removedIneligibleLegs:removed,
        candidateComplete:false,momentumScore:null,sgpScore:null,correlation:null,explanation:null,nukeCeilingVerified:false,marketMix:[...new Set(legs.map(x=>x?.cat||x?.category).filter(Boolean))],
        estimatedOdds:null,actualSgpOdds:null,estimatedTargetBandMet:false,
        payoutBandVerified:false,nukePayoutVerified:false,
        combinedBookQuoteVerified:false,verifiedLegs:0,eligibleBookLegs:0,
        publishable:false,publishableAsBookSgp:false,bookVerificationPending:true,
        combinedPriceType:"lineup_changed_no_book_quote",
        verifiedAt:null,pricingNote:reason,reason};
    }).filter(Boolean);
  }
  return output;
}
