// Public-safe, aggregate-only NBA collector health summary.
// Do not expose internal player records, credentials, or unverified betting claims.
export function publicNbaCollectorHealth(report={}){
 const rows=Array.isArray(report.results)?report.results:[];
 const projectionCount=rows.reduce((sum,r)=>sum+(Number(r?.projectionCount)||0),0);
 const emptyGames=rows.filter(r=>r?.status!=='held'&&r?.status!=='collector_error'&&
  !(Number(r?.projectionCount)>0)).length;
 return {checkedAt:report.checkedAt||null,checkedGames:rows.length,
  projectionCount,emptyGames,hasResearchProjections:projectionCount>0,
  note:'Research projections only; not verified starters or sportsbook offers.'};
}
