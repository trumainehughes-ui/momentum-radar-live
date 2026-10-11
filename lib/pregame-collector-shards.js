// Stable two-way game sharding. Two Vercel crons every 15 minutes can
// handle ALL due games without a single serverless invocation serializing an
// entire NFL or NBA slate. Future leagues need verified provider adapters.
import {put,list} from '@vercel/blob';
import {NFL_CHECKPOINT_RESULT_STATES} from './nfl-checkpoint-outcome.js';
export const COLLECTOR_SHARDS=2;
const PREFIX='momentum-ops/v1/pregame-collector-';
const LEAGUES=new Set(['nfl','nba']);
const INJURY_WATCH_STATES=new Set(['compared','baseline_created',
 'insufficient_injury_evidence','DETECTOR_UNAVAILABLE','DETECTOR_RESPONSE_INVALID',
 'NOT_CONFIGURED','UNTRUSTED_ORIGIN']);
const CHECKPOINT_STATES=new Set(['NOT_DUE','NOT_CONFIGURED','UNTRUSTED_ORIGIN',
 'ALREADY_ATTEMPTED_OR_STORE_UNAVAILABLE','DAILY_CHECKPOINT_BUDGET_EXHAUSTED',
 'TOKEN_UNAVAILABLE','TOKEN_STORE_UNAVAILABLE','MARKET_REFRESH_UNAVAILABLE',
 'MARKET_RESPONSE_UNVERIFIED','MARKET_REFRESHED','SKIPPED_VERIFIED_INJURY_REFRESH']);
const FAILURE_CODES=new Set(['MARKET_REQUEST_TIMEOUT','MARKET_RUNTIME_ERROR',
 'MARKET_RATE_LIMITED','MARKET_AUTH_REJECTED','MARKET_SERVICE_UNAVAILABLE',
 'MARKET_RESPONSE_NOT_OK']);
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
  bookCheckpoint:x.bookCheckpoint?{
   status:CHECKPOINT_STATES.has(x.bookCheckpoint.status)?
    x.bookCheckpoint.status:'MARKET_RESPONSE_UNVERIFIED',
   stage:['DAY_AHEAD','FINAL_T_MINUS_30'].includes(x.bookCheckpoint.stage)?
    x.bookCheckpoint.stage:null,
   outcomeStatus:NFL_CHECKPOINT_RESULT_STATES.has(x.bookCheckpoint.outcomeStatus)?
    x.bookCheckpoint.outcomeStatus:null,
   priorAttemptOutcome:NFL_CHECKPOINT_RESULT_STATES.has(x.bookCheckpoint.priorAttemptOutcome)?
    x.bookCheckpoint.priorAttemptOutcome:null,
   nativeOfferRows:Math.max(0,Math.min(1000,Math.floor(Number(x.bookCheckpoint.nativeOfferRows)||0))),
   verifiedBookTiers:Math.max(0,Math.min(6,Math.floor(Number(x.bookCheckpoint.verifiedBookTiers)||0)))
  }:null,
  injuryWatch:x.injuryWatch?{
   status:INJURY_WATCH_STATES.has(x.injuryWatch.status)?
    x.injuryWatch.status:'DETECTOR_RESPONSE_INVALID',
   changesDetected:Math.max(0,Math.min(100,
    Math.floor(Number(x.injuryWatch.changesDetected)||0))),
   tokenIssued:x.injuryWatch.tokenIssued===true,
   modelRefreshStatus:['completed','failed','timeout_or_unavailable']
    .includes(x.injuryWatch.modelRefreshStatus)?
     x.injuryWatch.modelRefreshStatus:null,
   modelRefreshHttpStatus:Number.isInteger(x.injuryWatch.modelRefreshHttpStatus)&&
    x.injuryWatch.modelRefreshHttpStatus>=100&&
    x.injuryWatch.modelRefreshHttpStatus<=599?
     x.injuryWatch.modelRefreshHttpStatus:null
  }:null,
  // Preserve bounded diagnostic classifications, never upstream error bodies.
  httpStatus:Number.isInteger(x.httpStatus)&&x.httpStatus>=100&&x.httpStatus<=599?
   x.httpStatus:null,
  failureCode:FAILURE_CODES.has(x.failureCode)?x.failureCode:null,
  ...collectorTierCoverage(x),
  // Legacy stored count is explicitly RAW; NFL can save separate unquoted
  // DraftKings/FanDuel representations of the same three model tiers.
  rawSgpRecordCount:Number(x.sgps||0),rawPropRecordCount:Number(x.picks||0),
  changed:x.changed===true,
  changedFields:(Array.isArray(x.changedFields)?x.changedFields:[])
   .filter(k=>['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS','FIRST_SNAPSHOT'].includes(k)),
  reason:x.status==='markets_unavailable'?'Market service did not provide a usable response; inspect HTTP status and failure code.':
   x.status==='collector_error'?'Collector task failed; see server logs.':
   String(x.reason||'').slice(0,190)
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
  note:'Each result is model coverage, not a verified sportsbook ticket or current official starter guarantee.'};
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
   const results=(Array.isArray(report.results)?report.results:[]).map(item=>
    item?.coverage?item:{...item,...collectorTierCoverage(item)});
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
