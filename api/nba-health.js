import {nbaFindLatestPregameBlob,nbaWritePregameSnapshot} from '../lib/nba-pregame-snapshot-store.js';
import {blobCredentialMode} from '../lib/blob-storage-config.js';
import {timingSafeEqual} from 'node:crypto';
import {nbaPrepareEvidence} from '../lib/nba-pregame-model.js';
import {pregameAiAudit} from '../lib/pregame-ai-review.js';
import {sportsbookCoverageAudit} from '../lib/sportsbook-source-policy.js';
import {sportResearchVerificationStatus} from '../lib/sport-sgp-verification-gate.js';
import {fetchEspnEventStarters} from '../lib/espn-event-starter-evidence.js';
import {nflRunCollectorBatch} from '../lib/nfl-collector-readiness.js';
import {pregamePhase,pregameEvidenceAudit,pregameNeedsAiReview}
 from '../lib/pregame-revalidation.js';
import {selectedShardGames,collectorAuditReport,writeCollectorAudit}
 from '../lib/pregame-collector-shards.js';
const PREFIX='momentum-pregame/v1/nba-';
const MS=60_000,LOOKAHEAD=36*60*MS;
export const NBA_PREGAME_MODEL_VERSION='v7-game-scoped-starter-lineup-evidence';
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
export async function nbaReadPregame(id,{strict=false}={}){
 if(!/^\d{7,12}$/.test(String(id)))return null;
 try{
  const hit=await nbaFindLatestPregameBlob(id);
  if(!hit)return null;
  // An immutable URL has no old-overwrite CDN race, unlike the legacy
  // single nba-GAMEID.json key. Owner and public read the same newest file.
  const d=await json(hit.url,6500);
  return d.gameId===String(id)&&Array.isArray(d?.sgps)?d:null;
 }catch(e){if(strict)throw Error('nba_snapshot_read_unavailable');return null}
}
export function nbaPregameStage(game,prior,{now=Date.now()}={}){
 if(game?.status!=='SCHEDULED')return{due:false,stage:'CLOSED'};
 const phase=pregamePhase(game,{now});
 if(!phase.due)return{due:false,stage:phase.stage};
 const before=Date.parse(game.kickoff)-now,stage=phase.stage;
 if(prior?.modelVersion&&prior.modelVersion!==NBA_PREGAME_MODEL_VERSION)
  return{due:true,stage,reason:'model_version_changed'};
 const at=Date.parse(prior?.checkedAt||''),
   age=Number.isFinite(at)?now-at:Infinity;
 const ttl=phase.maxSnapshotAgeMinutes*MS;
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
   pregameVerification:current?snapshot.pregameVerification||null:null,
  injuryCheckedAt:snapshot.injuryCheckedAt,injuryReportStatus:snapshot.injuryReportStatus||'UNKNOWN',
  sportsbookVerified:false,aiReviewed:current&&snapshot.aiReviewed===true,
  aiReviewStatus:current?snapshot.aiReview?.status||'PENDING':'STALE',
  aiProvider:current?snapshot.aiReview?.provider||null:null,
  historicalSeason:snapshot.historicalSeason||null,sampleSource:snapshot.sampleSource||'UNAVAILABLE',
  reason:current?snapshot.reason||'No verified pregame player models available.':freshness.reason};
}
export async function nbaCollectPregame(game,{now=Date.now(),prior=null,prepare=nbaPrepareEvidence,
 fetchJson=json,review=pregameAiAudit,write=nbaWritePregameSnapshot}={}){
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
 // Event-specific ESPN roster flags supplement historical game usage.
 // Do not mislabel them as official NBA inactives or sportsbook markets.
 const eventStarters=observed?await fetchEspnEventStarters({
  league:'nba',gameId:String(game.gameId),
  competitors:observed?.header?.competitions?.[0]?.competitors,
  now,fetchJson:url=>fetchJson(url,4500)}):
  {checked:false,starters:[],startersConfirmed:false,teamsChecked:0,
   reason:'SUMMARY_UNAVAILABLE',source:'ESPN_CORE_GAME_ROSTER'};
 const starterIds=new Map(eventStarters.starters.map(p=>[p.playerId,p]));
 const starterMatch=p=>{
  const id=String(p?.playerId||p?.playerID||''),e=starterIds.get(id);
  return Boolean(e&&String(e.team)===String(p?.team)&&
   !injuries.some(i=>String(i.team)===String(p?.team)&&
    String(i.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===
    String(p?.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'')&&
    /\b(?:OUT|DOUBTFUL|QUESTIONABLE|INACTIVE|SUSPENDED)\b/i.test(String(i.status||''))));
 };
 // Old SGP-only comparisons missed same-player prop changes, injury
 // designations and defense-vs-position movements. Fingerprint all of them
 // on each scheduled collection instead.
 const result={...evidence,
  playerProjections:(evidence.playerProjections||[]).map(p=>({
   ...p,starterVerified:starterMatch(p),
   starterStatus:starterMatch(p)?'CONFIRMED_STARTER':'UNCONFIRMED',
   starterSource:starterMatch(p)?'ESPN_CORE_GAME_ROSTER_STARTER_FLAG':null})),
  sgps:(evidence.sgps||[]).map(card=>({...card,
   legs:(card.legs||[]).map(p=>({
    ...p,starterVerified:starterMatch(p),
    starterStatus:starterMatch(p)?'CONFIRMED_STARTER':'UNCONFIRMED',
    starterSource:starterMatch(p)?'ESPN_CORE_GAME_ROSTER_STARTER_FLAG':null}))})),
  starterEvidence:{checked:eventStarters.checked,
   startersConfirmed:eventStarters.startersConfirmed,
   teamCounts:eventStarters.starterCounts||{},
   source:eventStarters.source,
   playerIds:(eventStarters.starters||[]).map(x=>x.playerId).sort(),
   officialInactivesVerified:false},
  gameId:game.gameId,kickoff:game.kickoff,
  home:game.home,away:game.away,
  checkedAt:new Date(now).toISOString(),
  injuryCheckedAt:injurySectionPresent?new Date(now).toISOString():null,
  injuryReportStatus:injurySectionPresent?'ESPN_REPORTED_INJURIES_RECHECKED':
   observed?'ESPN_SUMMARY_WITHOUT_INJURY_SECTION':'ESPN_SUMMARY_UNAVAILABLE',
  stage:plan.stage,modelVersion:NBA_PREGAME_MODEL_VERSION,
  seasonYear:game.seasonYear||null,seasonType:game.seasonType||null,
  revision:(Number(prior?.revision)||0)+1,
  changedFromPrior:false,
  aiReviewed:false,adjustmentPolicy:'Deterministic roster and injury revalidation; Groq/OpenRouter advisory cannot silently change picks',
  verifiedInjuries:injuries,completed:false,
  injuryLimitations:injurySectionPresent?
   'ESPN reported statuses checked; official inactives and starters not confirmed':
   'ESPN injury-report section unavailable; status is UNVERIFIED. Do not assume no players are injured, healthy or starting.'};
 const audit=pregameEvidenceAudit(prior,result,{league:'nba'});
 result.evidenceDigests=audit.evidenceDigests;
 result.changedFromPrior=audit.changedFromPrior;
 result.changedFields=audit.changedFields;
 result.revalidatedAt=new Date(now).toISOString();
 result.refreshPolicy='DAY_AHEAD_60M_PREGAME_15M_FINAL_10M_WITH_15M_CRON';
 result.propCategories=['points','rebounds','assists','threes','pra'];
 // Report missing sportsbook sourcing explicitly; ESPN player models are not
 // evidence that either sportsbook's public page was checked.
 result.sportsbookCoverage=sportsbookCoverageAudit({sport:'nba',gameId:game.gameId,
  offers:[],attempts:[]});
 result.verifiedIndividualOffers=[];
 result.pregameVerification=sportResearchVerificationStatus({
  sport:'nba',gameId:game.gameId,now,
  injuryCheckedAt:result.injuryCheckedAt,
  injurySourceAvailable:injurySectionPresent,
  officialInactivesVerified:false,
  startersConfirmed:eventStarters.startersConfirmed===true,bookOffers:[]});
 result.offenseDefenseStatus=result.offenseDefense?.status||'INSUFFICIENT_SAMPLES';
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
 }else if(pregameNeedsAiReview({stage:plan.stage,
   changedFields:audit.changedFields,
   priorAiReviewed:prior?.aiReviewed===true&&prior?.stage==='FINAL_T_MINUS_30'&&
    prior?.modelVersion===NBA_PREGAME_MODEL_VERSION})){
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
  injuryCount:injuries.length,changedFields:result.changedFields,
  offenseDefenseStatus:result.offenseDefenseStatus,reason:result.reason||null};
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
 const shard=Number(req.query?.shard??0);
 if(!Number.isInteger(shard)||shard<0||shard>1)
  return res.status(400).json({ok:false,error:'invalid_collector_shard'});
 // Scan three calendar days so the day-ahead window catches the first
 // regular-season games even when the slate has been dark for days.
 const date=dateET(),dates=[date,addDay(date,1),addDay(date,2)];
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
 })).values()].filter(g=>g.status==='SCHEDULED'&&g.stage==='REGULAR SEASON'&&nbaPregameStage(g,null).stage!=='OUTSIDE_WINDOW');
 const assigned=selectedShardGames(games,shard);
 const histories=await Promise.all(assigned.map(g=>nbaReadPregame(g.gameId)));
 const pending=assigned.map((g,i)=>({gameId:g.gameId,g,prior:histories[i],plan:nbaPregameStage(g,histories[i])}))
   .filter(x=>x.plan.due);
 // If the batch times out before completion the last persisted marker shows
 // RUNNING rather than silently presenting stale successful coverage.
 const startedAt=new Date().toISOString();
 await writeCollectorAudit(collectorAuditReport('nba',shard,[],{
  due:pending.length,startedAt,state:'RUNNING'}));
 const reports=await nflRunCollectorBatch(pending,async({g,prior})=>
  nbaCollectPregame(g,{prior}),{concurrency:3});
 await writeCollectorAudit(collectorAuditReport('nba',shard,reports,{
  due:pending.length,startedAt,state:'COMPLETE'}));
 return res.status(200).json({ok:true,datesChecked:dates,games:games.length,
  shard,shardsTotal:2,assignedGames:assigned.length,
  due:pending.length,checked:reports.length,results:reports,
  failed:reports.filter(r=>r?.status==='collector_error').length,
  changed:reports.filter(r=>r?.changed).length,
  changedByCause:Object.fromEntries(['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS']
   .map(k=>[k,reports.filter(r=>r?.changedFields?.includes(k)).length])),
  note:'NBA model-only SGP candidates; same game is rechecked for injuries and eligible legs at 30 minutes. AI does not silently override deterministic selections.',
  checkedAt:new Date().toISOString()});
}
