// Stable two-way game sharding. Two Vercel crons every 15 minutes can
// handle ALL due games without a single serverless invocation serializing an
// entire NFL or NBA slate. Future leagues need verified provider adapters.
import {put,list} from '@vercel/blob';
export const COLLECTOR_SHARDS=2;
const PREFIX='momentum-ops/v1/pregame-collector-';
const LEAGUES=new Set(['nfl','nba']);
export function shardForGame(id){
 const s=String(id||'');
 if(!/^\d{7,12}$/.test(s))return null;
 return Number(BigInt(s)%BigInt(COLLECTOR_SHARDS));
}
export function selectedShardGames(games,shard){
 if(!Number.isInteger(shard)||shard<0||shard>=COLLECTOR_SHARDS)throw Error('invalid_collector_shard');
 const seen=new Set();
 return (Array.isArray(games)?games:[]).filter(g=>{
  const id=String(g?.gameId||'');
  if(seen.has(id)||shardForGame(id)!==shard)return false;
  seen.add(id);return true;
 }).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
}
export function collectorAuditPath(league,shard){
 if(!LEAGUES.has(league)||!Number.isInteger(shard)||shard<0||shard>=COLLECTOR_SHARDS)
  throw Error('invalid_collector_identity');
 return PREFIX+league+'-shard-'+shard+'.json';
}
export const COLLECTOR_TIERS=Object.freeze(['Small','Medium','Nuke']);
// Execution success means the source was refreshed; it NEVER proves that
// any sportsbook quote or even all three MODEL-ONLY SGP tiers are available.
export function collectorTierCoverage(report={}){
 const data=report?.modelTierReadiness;
 const byRisk=data&&typeof data==='object'&&!Array.isArray(data)?data:null;
 const listed=Array.isArray(report?.modelTiers)?report.modelTiers:null;
 const known=byRisk!==null||listed!==null||['NOT_READY','no_qualified_model_data'].includes(report?.status);
 if(!known)return{
  coverage:'UNVERIFIED',readyTiers:[],missingTiers:[],tierStatuses:null,
  modelCandidateCount:0,unverified:true
 };
 const tierStatuses=Object.fromEntries(COLLECTOR_TIERS.map(risk=>{
  const candidate=byRisk?byRisk[risk]?.status==='MODEL_CANDIDATE':
   listed?listed.includes(risk):false;
  return[risk,candidate?'MODEL_CANDIDATE':'NOT_READY'];
 }));
 const readyTiers=COLLECTOR_TIERS.filter(t=>tierStatuses[t]==='MODEL_CANDIDATE');
 const missingTiers=COLLECTOR_TIERS.filter(t=>tierStatuses[t]!=='MODEL_CANDIDATE');
 const reasons=Object.fromEntries(missingTiers.map(t=>[t,
  String(byRisk?.[t]?.reason||report?.reason||
   'Insufficient verified model evidence for this tier.').slice(0,190)]));
 return{coverage:readyTiers.length===3?'READY_3_OF_3':
  readyTiers.length?'PARTIAL_TIERS':'NO_QUALIFIED_TIERS',
  readyTiers,missingTiers,tierStatuses,tierReasons:reasons,
  modelCandidateCount:readyTiers.length,unverified:false};
}

export function collectorAuditReport(league,shard,reports,{now=Date.now(),state='COMPLETE',
 due=0,startedAt=null}={}){
 const completed=(Array.isArray(reports)?reports:[]).slice(0,40).map(x=>({
  gameId:String(x.gameId||''),status:String(x.status||'unknown').slice(0,60),
  stage:x.stage||null,
  ...collectorTierCoverage(x),
  // The same verification contract runs for every event, not a hand-picked
  // matchup. Bookmakers are tracked separately, per Small/Medium/Nuke tier.
  sportsbookTierAudit:(x.sgpVerification?.tiers||[]).map(t=>({
   risk:t.risk,modelStatus:t.modelStatus,
   sportsbookStatus:t.sportsbookStatus,
   books:Object.fromEntries(Object.entries(t.books||{}).map(([book,b])=>[book,{
    status:b.status,matchedLegs:b.matchedLegs,requiredLegs:b.requiredLegs
   }]))
  })),
  bookmakerVerifiedCount:(x.sgpVerification?.tiers||[]).reduce((sum,t)=>
   sum+Object.values(t.books||{}).filter(b=>
    b.combinedOddsVerified===true&&b.tierVerified===true&&
    Number.isFinite(Date.parse(b.quoteCheckedAt||''))&&
    Date.parse(b.quoteCheckedAt)<=now&&
    now-Date.parse(b.quoteCheckedAt)<=15*60000).length,0),
  // Legacy stored count is explicitly RAW; NFL can save separate unquoted
  // DraftKings/FanDuel representations of the same three model tiers.
  rawSgpRecordCount:Number(x.sgps||0),rawPropRecordCount:Number(x.picks||0),
  changed:x.changed===true,
  changedFields:(Array.isArray(x.changedFields)?x.changedFields:[])
   .filter(k=>['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS','FIRST_SNAPSHOT'].includes(k)),
  reason:String(x.reason||x.error||'').slice(0,190)
 }));
 const okStatus=new Set(['locked','updated','MODEL_ONLY','NOT_READY','no_qualified_model_data']);
 return {league,shard,state,startedAt,
  checkedAt:new Date(now).toISOString(),due,attempted:completed.length,
  successful:completed.filter(x=>okStatus.has(x.status)).length,
  failed:completed.filter(x=>!okStatus.has(x.status)).length,
  coverage:{
   full:completed.filter(x=>x.coverage==='READY_3_OF_3').length,
   partial:completed.filter(x=>x.coverage==='PARTIAL_TIERS').length,
   none:completed.filter(x=>x.coverage==='NO_QUALIFIED_TIERS').length,
   unverified:completed.filter(x=>x.coverage==='UNVERIFIED').length
  },
  results:completed,
  note:'Every due NFL/NBA game has a Small/Medium/Nuke sportsbook verification audit. The current live market adapters do not provide authenticated bookmaker-issued combined SGP quotes; MODEL_CANDIDATE and collector success are never verification.'};
}
export async function writeCollectorAudit(report,{putBlob=put}={}){
 try{
  const path=collectorAuditPath(report.league,report.shard);
  await putBlob(path,JSON.stringify(report),{access:'public',addRandomSuffix:false,allowOverwrite:true});
  return true;
 }catch(e){console.warn('pregame_audit_write_failed',report.league,report.shard);return false}
}
export async function readCollectorAudits(league,{listBlobs=list,fetchBlob=fetch,now=Date.now()}={}){
 if(!LEAGUES.has(league))return{ok:false,error:'invalid_league'};
 const entries=await Promise.all(Array.from({length:COLLECTOR_SHARDS},async(_,shard)=>{
  const path=collectorAuditPath(league,shard);
  try{
   const listing=await listBlobs({prefix:path,limit:3});
   const blob=listing.blobs?.find(x=>x.pathname===path);
   if(!blob)return{shard,status:'NO_COLLECTOR_AUDIT'};
   const res=await fetchBlob(blob.url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
   if(!res.ok)throw Error('blob_read_failed');
   const report=await res.json();
   if(report.league!==league||report.shard!==shard)throw Error('identity_mismatch');
   const age=now-Date.parse(report.checkedAt||'');
   const fresh=Number.isFinite(age)&&age>=0&&age<=30*60000;
   const status=!fresh?'STALE':report.state==='RUNNING'&&age>10*60000?
    'RUNNING_LONG':report.state;
   // During rollout, yesterday's audit blobs may use an older schema and
   // contain no tier-readiness information. Count those as UNVERIFIED,
   // never as zero failures or evidence that every tier is ready.
   const results=(Array.isArray(report.results)?report.results:[]).map(item=>{
    const normalized=item?.coverage?item:{...item,...collectorTierCoverage(item)};
    // An old successful collector's quote was valid THEN, not now.
    // Never show yesterday's price as verified in read-only operations.
    if(status!=='COMPLETE')return{...normalized,bookmakerVerifiedCount:0,
     sportsbookTierAudit:(normalized.sportsbookTierAudit||[]).map(t=>({
      ...t,sportsbookStatus:'STALE_COLLECTOR',
      books:Object.fromEntries(Object.entries(t.books||{}).map(([book,b])=>
       [book,{...b,status:'STALE_COLLECTOR'}]))
     }))};
    return normalized;
   });
   const coverage={full:results.filter(x=>x.coverage==='READY_3_OF_3').length,
    partial:results.filter(x=>x.coverage==='PARTIAL_TIERS').length,
    none:results.filter(x=>x.coverage==='NO_QUALIFIED_TIERS').length,
    unverified:results.filter(x=>x.coverage==='UNVERIFIED').length};
   return{...report,status,results,coverage};
  }catch{return{shard,status:'COLLECTOR_AUDIT_UNAVAILABLE'}}
 }));
 return{ok:true,league,shards:entries,
  summary:{shards:entries.length,
   reported:entries.filter(x=>x.status==='COMPLETE').length,
   due:entries.reduce((n,x)=>n+(x.due||0),0),
   successful:entries.reduce((n,x)=>n+(x.successful||0),0),
   failed:entries.reduce((n,x)=>n+(x.failed||0),0),
   coverage:{
    // A stale, missing or running collector cannot confirm CURRENT models.
    full:entries.filter(x=>x.status==='COMPLETE').reduce((n,x)=>n+(x.coverage?.full||0),0),
    partial:entries.filter(x=>x.status==='COMPLETE').reduce((n,x)=>n+(x.coverage?.partial||0),0),
    none:entries.filter(x=>x.status==='COMPLETE').reduce((n,x)=>n+(x.coverage?.none||0),0),
    unverified:entries.reduce((n,x)=>n+(x.status==='COMPLETE'?
     x.coverage?.unverified||0:x.due||x.results?.length||0),0)
   },
   staleShards:entries.filter(x=>x.status==='STALE').length,
   incompleteShards:entries.filter(x=>x.status!=='COMPLETE').length},
  note:'Collector execution success and SGP tier readiness are tracked separately. MODEL_ONLY is not a verified sportsbook quote; stale shard reports cannot confirm current coverage.'};
}
