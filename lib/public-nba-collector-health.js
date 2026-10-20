// Public-safe, aggregate-only NBA collector health summary.
// Do not expose internal player records, credentials, or unverified betting claims.
export function publicNbaCollectorHealth(report={}){
 const rows=Array.isArray(report.results)?report.results:[];
 const projectionCount=rows.reduce((sum,r)=>sum+(Number(r?.projectionCount)||0),0);
 const emptyGames=rows.filter(r=>r?.status!=='held'&&r?.status!=='collector_error'&&
  !(Number(r?.projectionCount)>0)).length;
 return {checkedAt:report.checkedAt||null,checkedGames:rows.length,
  projectionCount,emptyGames,hasResearchProjections:projectionCount>0,
  coverageStatus:rows.length===0?'NOT_OBSERVED':projectionCount>0?'RESEARCH_AVAILABLE':'NO_RESEARCH_PROJECTIONS',
  heldGames:rows.filter(r=>r?.status==='held').length,
  selectionBasis:'HISTORICAL_GAME_EVIDENCE_NOT_POPULARITY',
  note:'Research projections only; not verified starters or sportsbook offers.'};
}
