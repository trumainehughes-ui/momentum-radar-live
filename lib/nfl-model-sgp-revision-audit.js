// Pure deterministic diff between locked NFL MODEL tiers. Never reconstruct
// bookmaker offers or infer that a change is causally explained by an injury.
const TIERS=['Small','Medium','Nuke'];
const VALID_CHANGES=new Set(['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS','FIRST_SNAPSHOT']);
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
const normalize=x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const modelCard=(snap,risk)=>(Array.isArray(snap?.sgps)?snap.sgps:[])
 .find(x=>x?.risk===risk&&x.source==='DATA_MODEL'&&Array.isArray(x.legs));
function canonicalLegs(card){
 const ids=new Set(),mapped=new Map();
 for(const row of card?.legs||[]){
  const athlete=String(row?.playerID||row?.playerId||'').trim(),
   team=normalize(row?.team),
   category=String(row?.category||row?.cat||'').toLowerCase(),
   target=num(row?.threshold??row?.analyticsThreshold);
  // An invalid numeric target cannot establish a real leg revision.
  // Model yardage is in five-yard increments; TD/receptions are whole counts.
  const validTarget=target!==null&&(category==='td'?target===1:
   category==='receptions'?Number.isInteger(target):
   ['passing','rushing','receiving'].includes(category)?target%5===0:false);
  if(!athlete||!team||!['td','passing','rushing','receiving','receptions'].includes(category))
   return null;
  const key=athlete+'|'+team+'|'+category;
  if(ids.has(key))return null;
  ids.add(key);mapped.set(key,{target:validTarget?target:null,category});
 }
 return mapped;
}
export function nflModelSgpRevisionAudit(prior,current,{changedFields=[]}={}){
 const contextChanges=(Array.isArray(changedFields)?changedFields:[])
  .filter(s=>VALID_CHANGES.has(s)).slice(0,6);
 const priorExists=Boolean(prior&&Array.isArray(prior.sgps));
 const tiers=TIERS.map(risk=>{
  const old=canonicalLegs(modelCard(prior,risk)),
   now=canonicalLegs(modelCard(current,risk));
  if(now===null||priorExists&&old===null)return{
   risk,status:'UNCOMPARABLE',previousLegs:old?.size||0,currentLegs:now?.size||0,
   added:0,removed:0,retargeted:0
  };
  const previousLegs=old?.size||0,currentLegs=now?.size||0;
  // Check old and new targets before counting additions or removals.
  // A missing target on a newly added leg must not be called a correction.
  if([...(old?.values()||[]),...(now?.values()||[])]
   .some(row=>row.target===null))return{
    risk,status:'TARGETS_UNVERIFIED',previousLegs,currentLegs,
    added:0,removed:0,retargeted:0
   };
  if(!priorExists)return{
   risk,status:currentLegs?'INITIAL_CANDIDATE':'NOT_READY',
   previousLegs:0,currentLegs,added:currentLegs,removed:0,retargeted:0
  };
  let added=0,removed=0,retargeted=0;
  for(const [key,row] of now||[]){
   if(!old?.has(key)){added++;continue;}
   const previous=old.get(key);
   if(row.target!==previous.target)retargeted++;
  }
  for(const key of old?.keys()||[])if(!now?.has(key))removed++;
  const status=added||removed||retargeted?'MODEL_LEGS_UPDATED':'UNCHANGED';
  return{risk,status,previousLegs,currentLegs,added,removed,retargeted};
 });
 return{status:tiers.some(x=>x.status==='UNCOMPARABLE'||x.status==='TARGETS_UNVERIFIED')?
    'COMPARISON_INCOMPLETE':!priorExists?'INITIAL_BUILD':
   tiers.some(x=>x.status==='MODEL_LEGS_UPDATED')?'SGP_MODEL_REVISED':
   'NO_MODEL_LEG_CHANGE',
  tiers,changedEvidence:contextChanges,
  source:'LOCKED_ESPN_MODEL_SNAPSHOT',
  evidenceCausality:'changedEvidence denotes same-cycle observations, not proven reasons for a specific leg change.',
  sportsbookQuoted:false};
}
export function nflSafeSgpRevisionAudit(report){
 if(!report||!['INITIAL_BUILD','SGP_MODEL_REVISED','COMPARISON_INCOMPLETE',
  'NO_MODEL_LEG_CHANGE'].includes(report.status))return null;
 const clipped=n=>Math.max(0,Math.min(20,Math.floor(Number(n)||0)));
 return{status:report.status,changedEvidence:(Array.isArray(report.changedEvidence)?
  report.changedEvidence:[]).filter(x=>VALID_CHANGES.has(x)).slice(0,6),
  tiers:TIERS.map(risk=>{
   const t=(Array.isArray(report.tiers)?report.tiers:[]).find(x=>x.risk===risk);
   return{risk,status:['INITIAL_CANDIDATE','NOT_READY','MODEL_LEGS_UPDATED',
    'TARGETS_UNVERIFIED','UNCHANGED','UNCOMPARABLE'].includes(t?.status)?
    t.status:'UNCOMPARABLE',
    previousLegs:clipped(t?.previousLegs),currentLegs:clipped(t?.currentLegs),
    added:clipped(t?.added),removed:clipped(t?.removed),
    retargeted:clipped(t?.retargeted)};
  }),
  sportsbookQuoted:false};
}
