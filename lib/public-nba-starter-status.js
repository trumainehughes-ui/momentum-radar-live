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
