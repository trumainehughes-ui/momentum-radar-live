// Descriptive team-level opponent context; not a prop projection or betting edge.
const MAP={
 passingYards:{metric:'opponent-passing-yards-per-game',label:'Passing yards allowed per game'},
 rushingYards:{metric:'opponent-rushing-yards-per-game',label:'Rushing yards allowed per game'},
 receivingYards:{metric:'opponent-passing-yards-per-game',label:'Team passing yards allowed per game (not receiver-specific)'}
};
export function nflLicensedDefensiveContext(stat,evidence){
 const spec=MAP[String(stat||'')];
 if(!spec)return {available:false,reason:'UNSUPPORTED_STAT'};
 if(evidence?.status!=='READY')return {available:false,reason:'LICENSED_SOURCE_NOT_READY',metric:spec.metric};
 const raw=evidence?.defensiveMetrics?.[spec.metric];
 if(raw===null||raw===undefined||raw==='')return {available:false,reason:'METRIC_NOT_AVAILABLE',metric:spec.metric};
 const value=Number(raw);
 if(!Number.isFinite(value)||value<0)return {available:false,reason:'METRIC_NOT_AVAILABLE',metric:spec.metric};
 return {
  available:true,metric:spec.metric,label:spec.label,value,
  opponentTeam:evidence.opponentTeam||null,
  source:evidence.source||'TeamRankings licensed feed',
  updatedAt:evidence.updatedAt||null,
  interpretation:'Team-level descriptive allowance only; cannot establish positional vulnerability or an individual player hit probability.',
  sportsbookVerified:false,projectionAdjustmentApplied:false
 };
}
