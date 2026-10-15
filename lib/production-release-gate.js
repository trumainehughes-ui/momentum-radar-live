// Fail-closed release evaluation from existing collector audit evidence.
// A successful cron run is not a sportsbook-verified parlay.
export function evaluateCollectorReleaseGate(nfl,nba){
 const leagues={nfl,nba},issues=[];
 for(const [league,audit] of Object.entries(leagues)){
  if(audit?.ok!==true){issues.push(league+':AUDIT_UNAVAILABLE');continue}
  if(audit?.summary?.incompleteShards!==0||audit?.summary?.staleShards!==0||
     audit?.shards?.length!==2||audit.shards.some(s=>s.status!=='COMPLETE'))
   issues.push(league+':INCOMPLETE_OR_STALE_SHARDS');
  if(audit.shards?.some(s=>s.failed>0||s.attempted<s.due))
   issues.push(league+':UNPROCESSED_OR_FAILED_GAMES');
  if(audit.shards?.some(s=>s.coverage?.unverified>0||s.coverage?.none>0||s.coverage?.partial>0))
   issues.push(league+':MODEL_TIER_COVERAGE_INCOMPLETE');
 }
 // Model audit reports do not contain independently authenticated combined
 // sportsbook SGP quotes, so they can NEVER clear the production release gate.
 issues.push('NFL_AND_NBA:COMBINED_SPORTSBOOK_QUOTES_NOT_ATTESTED');
 return Object.freeze({ready:false,status:'BLOCKED',issues:[...new Set(issues)],
  note:'Collector audits alone cannot authorize production. Require real book-specific combined SGP quotes and the other release checks.'});
}
