// Shared NFL/NBA model selection policy: popularity is never evidence of value.
// Research projections alone do not certify sportsbook markets or player eligibility.
const REQUIRED=['playerBaseline','opponentAllowed','opportunity','availability'];
export function evaluateStatisticalPickEvidence(input={}){
 const missing=REQUIRED.filter(k=>!Number.isFinite(input[k])&&
  !(k==='availability'&&input.availability==='VERIFIED_ACTIVE'));
 const projection=Number(input.projectedStat),line=Number(input.verifiedBookLine);
 const hasProjection=Number.isFinite(projection)&&projection>=0;
 const hasLine=Number.isFinite(line)&&line>=0&&input.bookVerified===true;
 const edge=hasProjection&&hasLine?projection-line:null;
 return Object.freeze({
  eligible:missing.length===0&&hasProjection&&hasLine&&input.availability==='VERIFIED_ACTIVE'&&
   input.starterVerified===true,
  missingEvidence:missing,
  projectedStat:hasProjection?projection:null,
  verifiedBookLine:hasLine?line:null,
  rawProjectionEdge:edge,
  estimatedProbability:null, // Requires a calibrated distribution, not a point estimate.
  popularityUsed:false,
  reason:missing.length?'INSUFFICIENT_STATISTICAL_EVIDENCE':
   !hasLine?'NO_VERIFIED_SPORTSBOOK_LINE':
   input.starterVerified!==true||input.availability!=='VERIFIED_ACTIVE'?'PLAYER_ELIGIBILITY_UNVERIFIED':
   'STATISTICAL_RESEARCH_ONLY_PENDING_CALIBRATED_PROBABILITY'
 });
}
