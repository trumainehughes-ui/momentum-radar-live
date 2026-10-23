// Injury & Game Change Guardian. Pure and conservative: no fabricated workload boosts.
// Consumers supply timestamped official injury/lineup observations and independently
// validated adjustment factors; missing evidence never authorizes a final slip.
const bad=/^(OUT|INACTIVE|SUSPENDED|DNP|RULED_OUT)$/i;
const watch=/^(QUESTIONABLE|DOUBTFUL|GAME_TIME_DECISION|LIMITED|MINUTES_RESTRICTION|SNAP_RESTRICTION)$/i;
const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
export function evaluateParlayInjuryChanges(slip,{observations=[],adjustments=[],checkedAt,
 now=Date.now(),maxAgeMinutes=30,minEdgePct=0}={}){
 const last=Date.parse(checkedAt||'');
 const fresh=Number.isFinite(last)&&last<=now&&now-last<=maxAgeMinutes*60000;
 const byPlayer=new Map(observations.map(x=>[String(x.playerId),x]));
 const byLeg=new Map(adjustments.map(x=>[String(x.playerId)+'|'+String(x.category),x]));
 const legs=(slip?.legs||[]).map(leg=>{
  const obs=byPlayer.get(String(leg.playerId)),adj=byLeg.get(String(leg.playerId)+'|'+String(leg.category));
  const status=String(obs?.status||'UNKNOWN').toUpperCase();
  const originalProjection=number(leg.projection);
  const proposed=number(adj?.revisedProjection);
  const revisedProjection=proposed!==null&&adj?.evidenceVerified===true?proposed:originalProjection;
  const target=number(leg.target);
  const edgePct=revisedProjection!==null&&target!==null&&target>0?
   Math.round((revisedProjection-target)/target*10000)/100:null;
  const observedAt=Date.parse(obs?.checkedAt||'');
  const observationFresh=Number.isFinite(observedAt)&&observedAt<=now&&now-observedAt<=maxAgeMinutes*60000;
  const invalid=bad.test(status)||edgePct!==null&&edgePct<minEdgePct;
  const changed=!!adj&&adj.evidenceVerified===true&&proposed!==null&&proposed!==originalProjection;
  const reason=invalid?bad.test(status)?'PLAYER_UNAVAILABLE':'EDGE_BELOW_THRESHOLD':
   !observationFresh?'INJURY_STATUS_STALE_OR_MISSING':
   watch.test(status)?'QUESTIONABLE_OR_RESTRICTED':
   adj&&!adj.evidenceVerified?'UNVERIFIED_ADJUSTMENT':
   changed?'PROJECTION_RECALCULATED':'NO_MATERIAL_CHANGE';
  const state=invalid?'INVALIDATED':!fresh||!observationFresh||watch.test(status)||
   adj&&!adj.evidenceVerified?'RECHECK_REQUIRED':'VALID';
  return {...leg,originalProjection,revisedProjection,edgePct,injuryStatus:status,
   injuryReview:{state,reason,observedAt:obs?.checkedAt||null,
    adjustmentSource:adj?.source||null,adjustmentVerified:adj?.evidenceVerified===true}};
 });
 const invalidated=legs.filter(x=>x.injuryReview.state==='INVALIDATED');
 const pending=legs.filter(x=>x.injuryReview.state==='RECHECK_REQUIRED');
 return {status:invalidated.length?'INVALIDATED':pending.length?'RECHECK_REQUIRED':'VALID',
  finalized:!invalidated.length&&!pending.length&&legs.length>0,
  checkedAt:checkedAt||null,legs,affectedLegs:legs.filter(x=>x.injuryReview.state!=='VALID'),
  replacementsRequired:invalidated.map(x=>({playerId:x.playerId,category:x.category,
   reason:x.injuryReview.reason})),
  note:'Replacement candidates must independently pass all matchup, injury, historical-hit-rate and market verification gates.'};
}
