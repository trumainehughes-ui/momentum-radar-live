// Evidence-bound matchup calculations. Missing or stale data returns no estimate.
export function comparePositionMatchup({ offensePerGame, defenseAllowedPerGame, offenseSampleGames, defenseSampleGames, position, metric } = {}) {
  if (![offensePerGame,defenseAllowedPerGame].every(x=>Number.isFinite(x)&&x>=0)) return null;
  if (![offenseSampleGames,defenseSampleGames].every(x=>Number.isInteger(x)&&x>0)) return null;
  if (!["QB","RB","WR","TE"].includes(position) || !["passingYards","rushingYards","receivingYards","receptions"].includes(metric)) return null;
  const difference = offensePerGame - defenseAllowedPerGame;
  return { position, metric, offensePerGame, defenseAllowedPerGame, difference, limitedSample: Math.min(offenseSampleGames,defenseSampleGames)<5, advisoryOnly:true };
}
export function reviewLegRelationships(legs = []) {
  if (!Array.isArray(legs)) return { valid:false, reasons:["invalid_legs"] };
  const reasons=[];
  for (let i=0;i<legs.length;i++) for(let j=i+1;j<legs.length;j++) {
    const a=legs[i],b=legs[j];
    if (!a || !b) continue;
    if (a.playerId===b.playerId && a.market===b.market && a.line!==b.line) reasons.push("overlapping_player_market_thresholds");
    if (a.gameId && b.gameId && a.gameId!==b.gameId) reasons.push("different_games_in_sgp");
  }
  return { valid:reasons.length===0, reasons:[...new Set(reasons)], correlationVerified:false };
}
