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
export const COLLECTOR_MODEL_RISKS=['Small','Medium','Nuke'];
const CHANGE_CAUSES=new Set(['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS','FIRST_SNAPSHOT']);
export function collectorTierSummary(result={}){
 const ready=new Set();
 if(Array.isArray(result.modelTiers)){
  for(const risk of result.modelTiers)if(COLLECTOR_MODEL_RISKS.includes(risk))ready.add(risk);
 }
 const fromNFL=result.modelTierReadiness;
 if(fromNFL&&typeof fromNFL==='object'){
  for(const risk of COLLECTOR_MODEL_RISKS){
   if(fromNFL[risk]?.status==='MODEL_CANDIDATE'&&
      Number(fromNFL[risk]?.legs)>0)ready.add(risk);
  }
 }
 const tiers=Object.fromEntries(COLLECTOR_MODEL_RISKS.map(risk=>[
  risk,ready.has(risk)?'MODEL_CANDIDATE':'NOT_READY'
 ]));
 const known=Array.isArray(result.modelTiers)||
  Boolean(fromNFL&&typeof fromNFL==='object');
 return{tiers:known?tiers:null,readyCount:known?ready.size:null,
  allReady:known?ready.size===COLLECTOR_MODEL_RISKS.length:false};
}
export function collectorAuditReport(league,shard,reports,{now=Date.now(),state='COMPLETE',
 due=0,startedAt=null}={}){
 const completed=(Array.isArray(reports)?reports:[]).slice(0,40).map(x=>{
  const t=collectorTierSummary(x),
   changedFields=(Array.isArray(x.changedFields)?x.changedFields:[])
    .filter(v=>CHANGE_CAUSES.has(v));
  return{
   gameId:String(x.gameId||''),status:String(x.status||'unknown').slice(0,60),
   stage:x.stage||null,tiers:t.tiers,readyTierCount:t.readyCount,
   allModelTiersReady:t.allReady,modelOnly:true,verifiedCombinedOdds:false,
   // Nine NFL SGP records can include unquoted book-specific candidates,
   // never a count of actual sportsbook-confirmed correlated prices.
   unquotedCandidateRecords:Number(x.sgps||0),
   sgpCount:Number(x.sgps||0),
   propCount:Number(x.picks||0),changed:x.changed===true,
   changedFields,reason:String(x.reason||x.error||'').slice(0,130)
  };
 });
 const okStatus=new Set(['locked','updated','MODEL_ONLY','NOT_READY','no_qualified_model_data']);
 return {league,shard,state,startedAt,
  checkedAt:new Date(now).toISOString(),due,attempted:completed.length,
  successful:completed.filter(x=>okStatus.has(x.status)).length,
  failed:completed.filter(x=>!okStatus.has(x.status)).length,
  readyGames:completed.filter(x=>x.allModelTiersReady).length,
  incompleteModelGames:completed.filter(x=>x.readyTierCount!==null&&!x.allModelTiersReady).length,
  unknownModelGames:completed.filter(x=>x.readyTierCount===null).length,
  readyModelTiers:completed.reduce((n,x)=>n+(x.readyTierCount||0),0),
  results:completed,
  note:'Successful collector execution does not guarantee Small/Medium/Nuke models. These are data-model candidates, not book-confirmed parlays or official starter claims.'};
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
   return{...report,status:!fresh?'STALE':report.state==='RUNNING'&&age>10*60000?
    'RUNNING_LONG':report.state};
  }catch{return{shard,status:'COLLECTOR_AUDIT_UNAVAILABLE'}}
 }));
 return{ok:true,league,shards:entries,
  summary:{shards:entries.length,
   reported:entries.filter(x=>x.status==='COMPLETE').length,
   due:entries.reduce((n,x)=>n+(x.due||0),0),
   successful:entries.reduce((n,x)=>n+(x.successful||0),0),
   failed:entries.reduce((n,x)=>n+(x.failed||0),0),
   modelReadyGames:entries.reduce((n,x)=>n+(x.readyGames||0),0),
   modelIncompleteGames:entries.reduce((n,x)=>n+(x.incompleteModelGames||0),0),
   modelUnknownGames:entries.reduce((n,x)=>n+(x.unknownModelGames||0),0),
   modelReadyTiers:entries.reduce((n,x)=>n+(x.readyModelTiers||0),0),
   coverageCurrent:entries.every(x=>x.status==='COMPLETE')},
  note:'Collector outcomes for all scheduled game shards. A READY deployment alone does not verify complete data.'};
}
