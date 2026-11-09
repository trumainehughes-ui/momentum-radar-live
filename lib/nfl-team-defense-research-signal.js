// Independent team-level defensive context for NFL research.
// This is not a position matchup, probability, or automatic SGP pick.
export function nflTeamDefenseResearchSignal(stat,teamContext,{leagueBaseline=null}={}){
 if(!teamContext?.available)return {available:false,reason:'DEFENSIVE_CONTEXT_UNAVAILABLE'};
 const value=teamContext.value;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)
  return {available:false,reason:'INVALID_ALLOWANCE'};
 if(typeof leagueBaseline!=='number'||!Number.isFinite(leagueBaseline)||leagueBaseline<=0)
  return {available:true,ranked:false,allowance:value,metric:teamContext.metric,
   reason:'LEAGUE_BASELINE_NOT_VERIFIED',projectionAdjustmentApplied:false};
 const difference=value-leagueBaseline;
 const pct=Math.round(difference/leagueBaseline*1000)/10;
 return {available:true,ranked:true,allowance:value,leagueBaseline,
  metric:teamContext.metric,relativeAllowancePct:pct,
  direction:pct>=10?'MORE_ALLOWED':pct<=-10?'LESS_ALLOWED':'NEAR_LEAGUE_AVERAGE',
  interpretation:'Team-level descriptive comparison; confirm positional allowances, player usage, active role, injuries, weather and sportsbook offer separately.',
  projectionAdjustmentApplied:false};
}
