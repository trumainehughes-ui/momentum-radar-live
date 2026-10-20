// Shared read-only classification for public NBA model cards.
// Roster membership and historical game usage never prove a starting-five role.
export function publicNbaStarterStatus(leg){
 return leg?.starterVerified===true&&leg?.starterStatus==='CONFIRMED_STARTER'
  ?'GAME STARTER VERIFIED':'STARTER UNCONFIRMED';
}
export function publicNbaParlayPlayable(tier){
 return tier?.publishable===true&&tier?.combinedBookOddsVerified===true&&
  Array.isArray(tier?.legs)&&tier.legs.length>0&&
  tier.legs.every(leg=>leg.starterVerified===true&&
   leg.starterStatus==='CONFIRMED_STARTER'&&leg.marketVerified===true);
}

/**
 * Public-facing provenance label for model-only NBA projections.
 * A rebuilt snapshot is not proof of sportsbook verification or confirmed starters.
 */
export function publicNbaProjectionProvenance(snapshot){
 const sample=snapshot?.sampleSource==='PRIOR_SEASON'?'PREVIOUS-SEASON BASELINE':
  snapshot?.sampleSource==='CURRENT_SEASON'?'CURRENT-SEASON SAMPLE':'SAMPLE UNVERIFIED';
 const count=Array.isArray(snapshot?.playerProjections)?snapshot.playerProjections.length:0;
 return {sample,modelReady:count>0,projectionCount:count,
  label:count>0?'MODEL RESEARCH — NOT A VERIFIED SPORTSBOOK LINE':'NO CURRENT PLAYER PROJECTIONS'};
}
