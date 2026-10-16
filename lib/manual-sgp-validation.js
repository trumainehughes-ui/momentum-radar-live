// Pure prepublication guard for manually refreshed SGPs.
// American odds represent net winnings per $100 stake.
export const NFL_NET_PROFIT_BANDS = Object.freeze({
  Small:{min:2000,max:3000}, Medium:{min:3000,max:8000}, Nuke:{min:10001,max:Infinity}
});
export function validateManualSgp({sport,tier,legs,combinedAmericanOdds,book,gameId}) {
  const errors=[];
  if (!['NFL','NBA'].includes(sport)) errors.push('invalid_sport');
  if (!Array.isArray(legs)||legs.length<2) errors.push('insufficient_legs');
  if (!book || !gameId) errors.push('missing_book_or_game');
  const categories=new Set(),ids=new Set();
  for(const leg of Array.isArray(legs)?legs:[]){
    if(leg.book!==book || leg.gameId!==gameId) errors.push('cross_book_or_game');
    if(!leg.playerId || !leg.market || !leg.marketVerifiedAt || !leg.oddsVerified) errors.push('unverified_leg');
    const key=[leg.playerId,leg.market,leg.threshold].join(':');
    if(ids.has(key))errors.push('duplicate_leg');ids.add(key);
    categories.add(leg.market);
    if(sport==='NFL'&&['passing_yards','rushing_yards','receiving_yards'].includes(leg.market)&&
      (!Number.isInteger(leg.threshold)||leg.threshold%5!==0))errors.push('invalid_yard_increment');
  }
  if(sport==='NFL' && categories.size<2)errors.push('insufficient_market_mix');
  const odds=Number(combinedAmericanOdds),band=sport==='NFL'?NFL_NET_PROFIT_BANDS[tier]:null;
  if(!Number.isFinite(odds) || odds<=0)errors.push('unverified_combined_odds');
  else if(sport==='NFL' && (!band || odds<band.min || odds>band.max))errors.push('outside_tier_payout');
  else if(sport==='NBA')errors.push('nba_payout_policy_not_configured');
  // No auto-publication even when the proposed structure passes; independent
  // live sportsbook acceptance and final injury checks are still required.
  return {valid:errors.length===0,errors:[...new Set(errors)],publicationBlocked:true};
}
