// Injury and lineup revalidation for NBA and NFL research slips.
// Conservative by design: changes invalidate picks pending a fresh model run,
// rather than inventing workload/efficiency adjustments.
const bad=/\b(OUT|INACTIVE|DOUBTFUL|SUSPENDED|RULED OUT)\b/i;
const uncertain=/\b(QUESTIONABLE|GAME.TIME DECISION|LIMITED|MINUTES RESTRICTION|SNAP COUNT)\b/i;
const time=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?t:null};
const identity=p=>String(p.playerId||p.name||'').trim().toLowerCase();
export function assessSlipInjuryChanges({legs=[],players=[],previousPlayers=[],checkedAt,now=Date.now(),maxAgeMinutes=30,gameChanges=[]}={}){
 const checked=time(checkedAt),fresh=checked!==null&&checked<=now&&now-checked<=maxAgeMinutes*60000;
 const byId=new Map(players.map(p=>[identity(p),p]));
 const before=new Map(previousPlayers.map(p=>[identity(p),p]));
 const material=gameChanges.filter(x=>x?.material===true);
 const audits=legs.map(leg=>{
  const current=byId.get(identity(leg)),prior=before.get(identity(leg));
  const currentStatus=String(current?.injuryStatus||current?.status||'UNKNOWN');
  const oldStatus=String(prior?.injuryStatus||prior?.status||'UNKNOWN');
  const reasons=[];
  if(!fresh)reasons.push('INJURY_REPORT_STALE_OR_MISSING');
  if(!current)reasons.push('PLAYER_STATUS_NOT_VERIFIED');
  if(bad.test(currentStatus))reasons.push('PLAYER_UNAVAILABLE');
  else if(uncertain.test(currentStatus))reasons.push('PLAYER_RESTRICTED_OR_UNCERTAIN');
  if(prior&&currentStatus!==oldStatus)reasons.push('PLAYER_STATUS_CHANGED');
  if(material.length)reasons.push('MATERIAL_GAME_CHANGE_REQUIRES_REMODEL');
  const previousProjection=Number(leg.projection);
  const adjustedProjection=Number(current?.updatedProjection);
  const hasRecalculation=Number.isFinite(adjustedProjection)&&current?.modelRecalculatedAt&&
   time(current.modelRecalculatedAt)!==null&&time(current.modelRecalculatedAt)>=checked;
  if(material.length&&!hasRecalculation)reasons.push('PROJECTION_RECALCULATION_PENDING');
  const status=reasons.some(r=>r==='PLAYER_UNAVAILABLE')?'INVALIDATED':
   reasons.length?'RECHECK_REQUIRED':'VALID';
  return {...leg,injuryAudit:{status,reasons,currentStatus,previousStatus:oldStatus,
   checkedAt:checkedAt||null,originalProjection:Number.isFinite(previousProjection)?previousProjection:null,
   revisedProjection:hasRecalculation?adjustedProjection:null,
   replacementRequired:status==='INVALIDATED',replacementSelected:false}};
 });
 const status=audits.some(l=>l.injuryAudit.status==='INVALIDATED')?'INVALIDATED':
  audits.some(l=>l.injuryAudit.status==='RECHECK_REQUIRED')?'RECHECK_REQUIRED':'VALID';
 return {status,checkedAt:checkedAt||null,injuryCheckFresh:fresh,legs:audits,
  affectedLegs:audits.filter(l=>l.injuryAudit.status!=='VALID').length,
  finalized:false,reason:status==='VALID'?'Injury gate passed; market and lineup gates still required.':
   'Slip held pending injury review, recalculation, and qualified replacement.'};
}
