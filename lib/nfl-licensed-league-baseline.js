// League-relative context is descriptive only, never a player projection.
// Require broad coverage to avoid a biased baseline from a handful of teams.
export function nflLicensedLeagueBaseline(teams,metric,{minimumTeams=24}={}){
 if(!String(metric||'').startsWith('opponent-'))return {available:false,reason:'NOT_DEFENSIVE_METRIC'};
 const rows=Object.values(teams||{}).map(t=>t?.[metric]).filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
 if(rows.length<minimumTeams)return {available:false,reason:'INSUFFICIENT_LEAGUE_COVERAGE',teamsCovered:rows.length,minimumTeams};
 const mean=rows.reduce((sum,n)=>sum+n,0)/rows.length;
 if(mean<=0)return {available:false,reason:'INVALID_LEAGUE_BASELINE'};
 return {available:true,value:Math.round(mean*100)/100,teamsCovered:rows.length,metric,source:'Licensed same-season NFL team defensive statistics',projectionAdjustmentApplied:false};
}
