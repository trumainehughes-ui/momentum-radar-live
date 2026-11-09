// Research completeness is separate from any player's projected outcome.
export function matchupSampleQuality({comparison,player,defense,upstreamFailures=0,eventsOmitted=0}={}){
 if(comparison?.ok!==true||!Number.isFinite(player?.games)||!Number.isFinite(defense?.games))
  return 'insufficient';
 if(player.games<3||defense.games<3||upstreamFailures>0||eventsOmitted>0)return 'limited';
 return 'historical_sample';
}
