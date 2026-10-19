// Deterministic, evidence-only NBA matchup intelligence for the AI review layer.
// No sportsbook offers, starter claims, or injury statuses are inferred here.
export const NBA_MATCHUP_CATEGORIES=Object.freeze(['points','rebounds','assists','threes']);
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const POSITIONS=new Set(['PG','SG','SF','PF','C']);
const bounded=(n,low,high)=>Math.min(high,Math.max(low,n));
export function nbaMatchupIntelligence({player,opponent,asOf,minimumGames=5,sampleSource='UNKNOWN',historicalSeason=null}={}){
 const warnings=[];
 if(sampleSource==='PRIOR_SEASON')warnings.push('PRIOR_SEASON_BASELINE');
 if(!['CURRENT_SEASON','PRIOR_SEASON'].includes(sampleSource))warnings.push('SAMPLE_SEASON_UNVERIFIED');
 const position=String(player?.position||'').toUpperCase();
 if(!POSITIONS.has(position))warnings.push('POSITION_NOT_VERIFIED');
 if(!opponent?.teamId)warnings.push('OPPONENT_NOT_VERIFIED');
 const t=Date.parse(asOf||'');
 if(!Number.isFinite(t))warnings.push('AS_OF_MISSING');
 const metrics={};
 for(const category of NBA_MATCHUP_CATEGORIES){
  const offense=player?.perGame?.[category],defense=opponent?.allowedByPosition?.[position]?.[category];
  const games=opponent?.allowedByPosition?.[position]?.games;
  const sampleValid=Number.isInteger(games)&&games>=minimumGames;
  if(!finite(offense)||!finite(defense)||!sampleValid){
   metrics[category]={status:'INSUFFICIENT_EVIDENCE',playerAverage:finite(offense)?offense:null,
    opponentPositionAllowed:finite(defense)?defense:null,opponentSampleGames:Number.isInteger(games)?games:0};
   continue;
  }
  // Position allowed is contextual evidence only, not a projection multiplier:
  // there is no league positional baseline or actual assignment evidence here.
  metrics[category]={status:'CONTEXT_ONLY',playerAverage:offense,opponentPositionAllowed:defense,
   opponentSampleGames:games,difference:Number((offense-defense).toFixed(2))};
 }
 const ready=warnings.length===0&&NBA_MATCHUP_CATEGORIES.some(k=>metrics[k].status==='CONTEXT_ONLY');
 return {status:ready?'ADVISORY_ONLY':'NOT_READY',asOf:Number.isFinite(t)?new Date(t).toISOString():null,
  sampleSource,historicalSeason,playerId:player?.id||null,opponentTeamId:opponent?.teamId||null,position:POSITIONS.has(position)?position:null,
  metrics,warnings,aiInstruction:'Explain observed matchup context only. Never fabricate injuries, projections, offered props, odds or confirmed assignments.',
  sportsbookVerified:false,aiReviewed:false};
}
export function nbaAiEvidenceDigest(matchup){
 if(!matchup||!['ADVISORY_ONLY','NOT_READY'].includes(matchup.status))return null;
 return {status:matchup.status,asOf:matchup.asOf,sampleSource:matchup.sampleSource,
  historicalSeason:matchup.historicalSeason,playerId:matchup.playerId,
  opponentTeamId:matchup.opponentTeamId,position:matchup.position,metrics:matchup.metrics,
  warnings:matchup.warnings,aiInstruction:matchup.aiInstruction,
  sportsbookVerified:false};
}
