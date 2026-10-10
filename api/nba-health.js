import {list,put} from '@vercel/blob';
import {blobCredentialMode} from '../lib/blob-storage-config.js';
import {timingSafeEqual} from 'node:crypto';
import {nbaPrepareEvidence} from '../lib/nba-pregame-model.js';
import {pregameAiAudit} from '../lib/pregame-ai-review.js';
import {nflRunCollectorBatch} from '../lib/nfl-collector-readiness.js';
const PREFIX='momentum-pregame/v1/nba-';
const MS=60_000,LOOKAHEAD=36*60*MS;
export const NBA_PREGAME_MODEL_VERSION='v4-preseason-baseline-stage-freshness';
const path=id=>PREFIX+id+'.json';
const DAY='America/New_York';
const dateET=(when=new Date())=>{
 const o=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:DAY,year:'numeric',month:'2-digit',day:'2-digit'})
  .formatToParts(when).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return [o.year,o.month,o.day].join('-');
};
const addDay=(date,days)=>{
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
};
const authorized=(req,key)=>{
 if(!key)return false;
 const a=Buffer.from(String(req.headers?.authorization||'')),b=Buffer.from('Bearer '+key);
 return a.length===b.length&&timingSafeEqual(a,b);
};
async function json(url,timeout=10_000){
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error('upstream_'+r.status);
 return r.json();
}
export async function nbaReadPregame(id){
 if(!/^\d{7,12}$/.test(String(id)))return null;
 try{
  const key=path(id),a=await list({prefix:key,limit:3}),
   hit=a.blobs?.find(b=>b.pathname===key);
  if(!hit)return null;
  const d=await json(hit.url,6500);
  return d.gameId===String(id)&&Array.isArray(d?.sgps)?d:null;
 }catch{return null}
}
export function nbaPregameStage(game,prior,{now=Date.now()}={}){
 if(game?.status!=='SCHEDULED')return{due:false,stage:'CLOSED'};
 const before=Date.parse(game.kickoff)-now;
 if(!Number.isFinite(before)||before<=0||before>LOOKAHEAD)return{due:false,stage:'OUTSIDE_WINDOW'};
 const stage=before<=30*MS?'FINAL_T_MINUS_30':before<=90*MS?'PREGAME_VALIDATION':'DAY_AHEAD_BUILD';
 if(prior?.modelVersion&&prior.modelVersion!==NBA_PREGAME_MODEL_VERSION)
  return{due:true,stage,reason:'model_version_changed'};
 const at=Date.parse(prior?.checkedAt||''),
   age=Number.isFinite(at)?now-at:Infinity;
 const ttl=stage==='FINAL_T_MINUS_30'?10*MS:
  stage==='PREGAME_VALIDATION'?45*MS:6*60*MS;
 return{due:!prior||!Number.isFinite(age)||age<0||age>=ttl||prior.stage!==stage,
  stage,minutesToTipoff:Math.ceil(before/MS),snapshotAgeMs:Number.isFinite(age)?age:null};
}
// A successful Blob read is not proof that its pregame data is still current.
// We hold stale candidate legs until the scheduled collector has rechecked
// the actual game and injury context for the appropriate pre-tipoff window.
export function nbaPregameFreshness(snapshot,{now=Date.now(),gameStatus='SCHEDULED'}={}){
 if(!snapshot)return {status:'PENDING',reason:'No scheduled pregame build has completed.'};
 if(gameStatus!=='SCHEDULED')return{status:'CLOSED',reason:'Game has started or ended; historical model is not a live SGP.'};
 if(snapshot.modelVersion!==NBA_PREGAME_MODEL_VERSION)
  return{status:'STALE',reason:'Pregame model version changed; waiting for a new collection.'};
 const checked=Date.parse(snapshot.checkedAt||''),
   kickoff=Date.parse(snapshot.kickoff||''),
   age=now-checked,remaining=kickoff-now;
 if(!Number.isFinite(checked)||!Number.isFinite(kickoff)||age<0||
   remaining<=0||!Number.isFinite(remaining))
  return{status:'STALE',reason:'Game timestamp or pregame snapshot is invalid/outdated.'};
 const stage=remaining<=30*MS?'FINAL_T_MINUS_30':
  remaining<=90*MS?'PREGAME_VALIDATION':'DAY_AHEAD_BUILD';
 const maxAge=stage==='FINAL_T_MINUS_30'?20*MS:
  stage==='PREGAME_VALIDATION'?60*MS:8*60*MS;
 if(snapshot.stage!==stage)
  return{status:'STALE',reason:'New '+stage.replaceAll('_',' ')+' injury and model refresh is pending.'};
 if(age>maxAge)
  return{status:'STALE',reason:'Last NBA SGP/injury snapshot is older than the '+Math.round(maxAge/MS)+'-minute freshness limit.'};
 return{status:'CURRENT',stage,ageMinutes:Math.round(age/MS)};
}
export function nbaPregameStatus(snapshot,{now=Date.now(),gameStatus='SCHEDULED'}={}){
 const freshness=nbaPregameFreshness(snapshot,{now,gameStatus});
 if(!snapshot)return {...freshness,tiers:[],sportsbookVerified:false,aiReviewed:false};
 const ready=(snapshot.sgps||[]).filter(x=>x.status==='MODEL_CANDIDATE');
 const current=freshness.status==='CURRENT';
 return{status:current?(ready.length?'MODEL_ONLY':'NOT_READY'):freshness.status,
  freshness:freshness.status,tiers:current?ready.map(x=>x.risk):[],
  checkedAt:snapshot.checkedAt,stage:snapshot.stage,revision:snapshot.revision,
  injuryCheckedAt:snapshot.injuryCheckedAt,injuryReportStatus:snapshot.injuryReportStatus||'UNKNOWN',
  sportsbookVerified:false,aiReviewed:current&&snapshot.aiReviewed===true,
  aiReviewStatus:current?snapshot.aiReview?.status||'PENDING':'STALE',
  aiProvider:current?snapshot.aiReview?.provider||null:null,
  historicalSeason:snapshot.historicalSeason||null,sampleSource:snapshot.sampleSource||'UNAVAILABLE',
  reason:current?snapshot.reason||'No verified pregame player models available.':freshness.reason};
}
export async function nbaCollectPregame(game,{now=Date.now(),prior=null,prepare=nbaPrepareEvidence,
 fetchJson=json,review=pregameAiAudit,write=async data=>put(path(game.gameId),JSON.stringify(data),{
  access:'public',addRandomSuffix:false,allowOverwrite:true})}={}){
 const plan=nbaPregameStage(game,prior,{now});
 if(!plan.due)return {gameId:game.gameId,status:'held',stage:plan.stage};
 let observed=null;
 try{observed=await fetchJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+game.gameId,12_000)}
 catch{observed=null}
 // A day-ahead summary may not have been published yet. ESPN's scoreboard
 // event identity and team IDs remain the game anchor, but current injuries
 // must explicitly remain UNVERIFIED until that separate source is present.
 if(observed){
  const comp=observed?.header?.competitions?.[0],
   id=String(comp?.id||observed?.header?.id||''),
   teams=(comp?.competitors||[]).map(x=>x?.team?.abbreviation).filter(Boolean);
  if(id!==String(game.gameId)||!teams.includes(game.home.abbr)||!teams.includes(game.away.abbr))
   throw Error('nba_current_game_identity_mismatch');
 }
 const injurySectionPresent=Array.isArray(observed?.injuries);
 const injuries=[];
 for(const g of observed?.injuries||[]){
  const team=g?.team?.abbreviation;
  if(![game.home.abbr,game.away.abbr].includes(team))continue;
  for(const x of g.injuries||[]){
   const name=x?.athlete?.displayName||x?.athlete?.fullName;
   if(name)injuries.push({name,team,status:x.status||x.type?.description||'Unknown',
    source:'ESPN-reported; official starter status pending'});
  }
 }
 const evidence=await prepare({...game,injuries},{fetchJson});
 const same=JSON.stringify((prior?.sgps||[]).map(s=>({risk:s.risk,status:s.status,
  legs:(s.legs||[]).map(x=>[x.playerId,x.category,x.threshold])})))===
  JSON.stringify((evidence.sgps||[]).map(s=>({risk:s.risk,status:s.status,
  legs:(s.legs||[]).map(x=>[x.playerId,x.category,x.threshold])})));
 const result={...evidence,gameId:game.gameId,kickoff:game.kickoff,
  home:game.home,away:game.away,
  checkedAt:new Date(now).toISOString(),
  injuryCheckedAt:injurySectionPresent?new Date(now).toISOString():null,
  injuryReportStatus:injurySectionPresent?'ESPN_REPORTED_INJURIES_RECHECKED':
   observed?'ESPN_SUMMARY_WITHOUT_INJURY_SECTION':'ESPN_SUMMARY_UNAVAILABLE',
  stage:plan.stage,modelVersion:NBA_PREGAME_MODEL_VERSION,
  seasonYear:game.seasonYear||null,seasonType:game.seasonType||null,
  revision:(Number(prior?.revision)||0)+1,
  changedFromPrior:Boolean(prior)&&!same,
  aiReviewed:false,adjustmentPolicy:'Deterministic roster and injury revalidation; Groq/OpenRouter advisory cannot silently change picks',
  verifiedInjuries:injuries,completed:false,
  injuryLimitations:injurySectionPresent?
   'ESPN reported statuses checked; official inactives and starters not confirmed':
   'ESPN injury-report section unavailable; status is UNVERIFIED. Do not assume no players are injured, healthy or starting.'};
 // A failed data source must never overwrite an earlier populated model
 // without explaining the degradation. In either case, store audit metadata.
 if(result.status==='NOT_READY'&&prior?.status==='MODEL_ONLY')
  result.priorCandidateInvalidated=true;
 // Rebuilds are deterministic (injury/roster changes are authoritative).
 // Groq/OpenRouter is automatically asked to REVIEW only when T-30 begins or
 // qualified model legs materially change, never to manufacture replacement legs.
 const eligible=result.sgps?.some(x=>x.status==='MODEL_CANDIDATE');
 if(!eligible){
  result.aiReview={status:'SKIPPED',reason:'No eligible NBA SGP remains to review'};
 }else if(plan.stage==='FINAL_T_MINUS_30'&&(result.changedFromPrior||
   prior?.stage!=='FINAL_T_MINUS_30'||prior?.modelVersion!==NBA_PREGAME_MODEL_VERSION)){
   result.aiReview=await review('nba',game,result);
   result.aiReviewed=result.aiReview?.status==='REVIEWED';
 }else if(prior&&!result.changedFromPrior&&prior.stage===plan.stage&&
   prior.modelVersion===NBA_PREGAME_MODEL_VERSION&&prior.aiReview?.status==='REVIEWED'){
   result.aiReview=prior.aiReview;
   result.aiReviewed=true;
 }else result.aiReview={status:'PENDING',reason:'Awaiting eligible T-30 evidence review'};
 await write(result);
 return{gameId:game.gameId,status:result.status,stage:plan.stage,revision:result.revision,
  changed:result.changedFromPrior,modelTiers:(result.sgps||[]).filter(x=>x.status==='MODEL_CANDIDATE').map(x=>x.risk),
  injuryCount:injuries.length,reason:result.reason||null};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 // Vercel Cron includes Authorization: Bearer CRON_SECRET if configured.
 if(!authorized(req,process.env.CRON_SECRET))
  return res.status(401).json({ok:false,error:'cron_auth_required'});
 if(blobCredentialMode(process.env)==='NOT_CONFIGURED')
  return res.status(503).json({ok:false,error:'pregame_storage_not_configured',
   action:'Connect an existing Vercel Blob store to this project before running the snapshot collector.'});
 const date=dateET(),tomorrow=addDay(date,1),dates=[date,tomorrow];
 const schedules=await Promise.all(dates.map(async day=>{
  try{return await json('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+day.replaceAll('-','')+'&limit=100',12_000)}
  catch{return{events:[],sourceFailed:true}}
 }));
 if(schedules.every(x=>x.sourceFailed))return res.status(503).json({ok:false,error:'nba_scoreboard_unavailable'});
 const games=[...new Map(schedules.flatMap(x=>x.events||[]).map(ev=>{
  const c=ev.competitions?.[0]||{},parts=c.competitors||[],
   home=parts.find(x=>x.homeAway==='home'),away=parts.find(x=>x.homeAway==='away');
  return [String(ev.id),{gameId:String(ev.id),status:String(c.status?.type?.state||ev.status?.type?.state)==='pre'?'SCHEDULED':'CLOSED',
   kickoff:ev.date,seasonYear:ev?.season?.year||null,seasonType:ev?.season?.type||null,
   stage:ev?.season?.type===1?'PRESEASON':'REGULAR SEASON',
   home:{id:String(home?.team?.id||''),abbr:home?.team?.abbreviation},
   away:{id:String(away?.team?.id||''),abbr:away?.team?.abbreviation}}]
 })).values()].filter(g=>g.status==='SCHEDULED'&&nbaPregameStage(g,null).stage!=='OUTSIDE_WINDOW');
 const histories=await Promise.all(games.map(g=>nbaReadPregame(g.gameId)));
 const pending=games.map((g,i)=>({gameId:g.gameId,g,prior:histories[i],plan:nbaPregameStage(g,histories[i])}))
   .filter(x=>x.plan.due);
 const reports=await nflRunCollectorBatch(pending,async({g,prior})=>
  nbaCollectPregame(g,{prior}),{concurrency:3});
 return res.status(200).json({ok:true,datesChecked:dates,games:games.length,
  due:pending.length,checked:reports.length,results:reports,
  failed:reports.filter(r=>r?.status==='collector_error').length,
  note:'NBA model-only SGP candidates; same game is rechecked for injuries and eligible legs at 30 minutes. AI does not silently override deterministic selections.',
  checkedAt:new Date().toISOString()});
}
