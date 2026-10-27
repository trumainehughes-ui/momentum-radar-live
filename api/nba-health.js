import {validateSportsResearchEvidence} from '../lib/sports-data-registry.js';
import {nbaFindLatestPregameBlob,nbaWritePregameSnapshot} from '../lib/nba-pregame-snapshot-store.js';
import {latestModelSgpIngest} from './model-sgp-ingest.js';
import {blobCredentialMode} from '../lib/blob-storage-config.js';
import {timingSafeEqual} from 'node:crypto';
import {nbaPrepareEvidence} from '../lib/nba-pregame-model.js';
import {nbaCrossCheckProjections} from '../lib/nba-com-cross-check.js';
import {pregameAiAudit,nbaAiMatchupIdentityConflict} from '../lib/pregame-ai-review.js';
import {sportsbookCoverageAudit} from '../lib/sportsbook-source-policy.js';
import {sportResearchVerificationStatus} from '../lib/sport-sgp-verification-gate.js';
import {fetchEspnEventStarters,parseEspnSummaryStarters} from '../lib/espn-event-starter-evidence.js';
import {nflRunCollectorBatch} from '../lib/nfl-collector-readiness.js';
import {pregamePhase,pregameEvidenceAudit,pregameNeedsAiReview}
 from '../lib/pregame-revalidation.js';
import {selectedShardGames,collectorAuditReport,writeCollectorAudit}
 from '../lib/pregame-collector-shards.js';
const PREFIX='momentum-pregame/v1/nba-';
const MS=60_000,LOOKAHEAD=36*60*MS;
export const NBA_PREGAME_MODEL_VERSION='v17-summary-starter-evidence';
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
  if(d.gameId!==String(id)||!Array.isArray(d?.sgps))return null;
  const submitted=await latestModelSgpIngest('nba',String(id)).catch(()=>null);
  if(!submitted)return d;
  // Imported model research must match this event's roster projections.
  // A prediction is not a confirmed starter or sportsbook offer.
  const eligible=new Map((d.playerProjections||[]).filter(p=>
   p.starterVerified===true&&
   !/\b(OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED)\b/i.test(
    String(p.injuryStatus||p.availability||'')))
   .map(p=>[String(p.playerId||p.playerID),p]));
  const verified=(submitted.tiers||[]).filter(t=>(t.legs||[]).length>0&&
   t.legs.every(l=>{
    const p=eligible.get(String(l.playerId||''));
    return p&&String(p.team).toUpperCase()===String(l.team).toUpperCase();
   })).map(t=>({...t,status:'MODEL_CANDIDATE',publishable:false,
    starterVerificationStatus:'GAME_SCOPED_STARTERS_CONFIRMED',
    source:'CHATGPT_PLUGIN_MODEL_RESEARCH',
    reason:'Model-only research; individual sportsbook offers and combined odds unverified.'}));
  return {...d,sgps:[...verified,...d.sgps.filter(t=>
   !verified.some(v=>v.risk===t.risk))]};

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
 // Revisit legacy snapshots where SGP gating skipped AI despite available
 // independent player forecasts. Throttle retries to one per hour.
 const needsForecastReview=Array.isArray(prior?.playerProjections)&&
  prior.playerProjections.some(p=>Number.isFinite(Number(p.projection))&&Number(p.projection)>0)&&
  (prior?.aiReview?.status!=='REVIEWED'||
   nbaAiMatchupIdentityConflict(prior?.aiReview?.summary,game))&&age>=60*MS;
 return{due:needsForecastReview||!prior||!Number.isFinite(age)||age<0||age>=ttl||prior.stage!==stage,
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
 // Supplement ESPN evidence with NBA.com live scoreboard when the optional
 // nba_api adapter is reachable. Never block snapshot generation on it.
 let nbaComEvidence={status:'UNAVAILABLE',source:'nba_api',sportsbookVerified:false};
 let nbaComVerifiedCompletedGames=[];
 try{
  const origin=process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:null;
  if(origin){
   const nbaFeed=await fetchJson(origin+'/api/nba-open-data?action=scoreboard',4500);
   const games=Array.isArray(nbaFeed?.games)?nbaFeed.games:[];
   nbaComVerifiedCompletedGames=games.filter(g=>Number(g.gameStatus)===3&&/^\d{10}$/.test(String(g.gameId))&&Date.parse(g.gameTimeUTC)<Date.parse(game.kickoff));
   const match=games.find(x=>{
    const home=String(x?.homeTeam?.teamTricode||'').toUpperCase();
    const away=String(x?.awayTeam?.teamTricode||'').toUpperCase();
    const nbaDate=String(x?.gameTimeUTC||x?.gameDateTimeUTC||'');
    const tipoff=Date.parse(game.kickoff);
    const dateMatches=Number.isFinite(tipoff)&&Number.isFinite(Date.parse(nbaDate))&&
     Math.abs(Date.parse(nbaDate)-tipoff)<18*60*60*1000;
    return home===game.home.abbr&&away===game.away.abbr&&dateMatches;
   });
   nbaComEvidence={status:match?'MATCHED':'CONNECTED_NO_MATCH',source:'nba_api',
    checkedAt:nbaFeed.asOf||new Date(now).toISOString(),
    gameId:match?.gameId||null,gameStatus:match?.gameStatus||null,
    homeScore:match?.homeTeam?.score??null,awayScore:match?.awayTeam?.score??null,
    sportsbookVerified:false};
  }
 }catch{ /* ESPN remains the authoritative fallback for this collector. */ }
 const evidence=await prepare({...game,injuries},{fetchJson});
 const sportsDataResearchGate=validateSportsResearchEvidence('NBA',{
  source:'espn',observedAt:new Date(now).toISOString(),
  records:Array.isArray(evidence?.playerProjections)?evidence.playerProjections:[]
 });
 // Event-specific ESPN roster flags supplement historical game usage.
 // Do not mislabel them as official NBA inactives or sportsbook markets.
 const eventStarters=observed?await fetchEspnEventStarters({
  league:'nba',gameId:String(game.gameId),
  competitors:observed?.header?.competitions?.[0]?.competitors,
  now,fetchJson:url=>fetchJson(url,4500)}):
  {checked:false,starters:[],startersConfirmed:false,teamsChecked:0,
   reason:'SUMMARY_UNAVAILABLE',source:'ESPN_CORE_GAME_ROSTER'};
 const summaryStarters=observed?parseEspnSummaryStarters(observed,{
  gameId:String(game.gameId),checkedAt:new Date(now).toISOString()}):null;
 // Prefer the event-scoped roster; use the summary only when it explicitly
 // confirms all five starters for both teams.
 const selectedStarters=eventStarters.startersConfirmed?eventStarters:
  summaryStarters?.startersConfirmed?summaryStarters:eventStarters;
 const starterIds=new Map(selectedStarters.starters.map(p=>[p.playerId,p]));
 const starterMatch=p=>{
  const id=String(p?.playerId||p?.playerID||''),e=starterIds.get(id);
  return Boolean(e&&String(e.team)===String(p?.team)&&
   !injuries.some(i=>String(i.team)===String(p?.team)&&
    String(i.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===
    String(p?.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'')&&
    /\b(?:OUT|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|INACTIVE|SUSPENDED)\b/i.test(String(i.status||''))));
 };
 // Old SGP-only comparisons missed same-player prop changes, injury
 // designations and defense-vs-position movements. Fingerprint all of them
 // on each scheduled collection instead.
 // Supplement up to four eligible model candidates with NBA.com recent-game
 // observations. Never replace the existing projection without sample audit.
 const nbaComPlayerLogs=[];
 if(process.env.VERCEL_URL&&Array.isArray(evidence.playerProjections)){
  const tipoffDate=new Date(game.kickoff);
  const seasonStart=tipoffDate.getUTCFullYear()-(tipoffDate.getUTCMonth()<9?1:0);
  const season=seasonStart+'-'+String(seasonStart+1).slice(-2);
  const eligible=evidence.playerProjections.filter(p=>p.rotationEvidence?.eligible===true);
  // An absent rotation flag must not silently disable NBA.com enrichment.
  const candidates=eligible.length?eligible:evidence.playerProjections;
  const unique=[...new Set(candidates.map(p=>p.name||p.player).filter(Boolean))].slice(0,8);
  const results=await Promise.all(unique.slice(0,4).map(async name=>{
   try{
    const projection=evidence.playerProjections.find(p=>(p.name||p.player)===name);
    const team=String(projection?.team||'').toUpperCase();
    if(!/^[A-Z]{3}$/.test(team))return null;
    const origin='https://'+process.env.VERCEL_URL+'/api/nba-open-data?';
    const verifiedIds=nbaComVerifiedCompletedGames.filter(g=>
     [g.homeTeam?.teamTricode,g.awayTeam?.teamTricode].includes(team))
     .map(g=>String(g.gameId)).slice(0,10);
    const query=verifiedIds.length?
     new URLSearchParams({action:'recent-live-player-log-by-games',name,team,
      before:tipoffDate.toISOString().slice(0,10),gameIds:verifiedIds.join(',')}):
     new URLSearchParams({action:'recent-live-player-log',name,team,
      before:tipoffDate.toISOString().slice(0,10)});
    const d=await fetchJson(origin+query,9000);
    if(!d.ok||!Array.isArray(d.recentGames)||!d.recentGames.length)return null;
    const rows=d.recentGames.filter(x=>Date.parse(x.GAME_DATE)<Date.parse(game.kickoff));
    return {name,season,source:'nba_api_live',samples:rows.length,
     recent:rows.slice(0,10).map(x=>({
      date:x.GAME_DATE,points:x.PTS==null?null:Number(x.PTS),
      rebounds:x.REB==null?null:Number(x.REB),assists:x.AST==null?null:Number(x.AST),
      threes:x.FG3M==null?null:Number(x.FG3M),minutes:x.MIN==null?null:(/^PT(?:(\\d+)M)?(?:(\\d+(?:\\.\\d+)?)S)?$/.test(String(x.MIN))?Number((Number((String(x.MIN).match(/(\\d+)M/)||[])[1]||0)+Number((String(x.MIN).match(/(\\d+(?:\\.\\d+)?)S/)||[])[1]||0)/60).toFixed(2)):Number(x.MIN))}))};
   }catch{return null}
  }));
  nbaComPlayerLogs.push(...results.filter(Boolean));
 }
 // NBA.com live box scores provide player-level evidence even when the
 // historical stats.nba.com service blocks serverless IPs.
 const nbaComBoxScore={status:'UNAVAILABLE',source:'nba_api_live',players:[]};
 if(nbaComEvidence.gameId&&process.env.VERCEL_URL){
  try{
   const url='https://'+process.env.VERCEL_URL+'/api/nba-open-data?'+
    new URLSearchParams({action:'boxscore',gameId:String(nbaComEvidence.gameId)});
   const d=await fetchJson(url,4500);
   if(d.ok&&d.game){
    nbaComBoxScore.status='CONNECTED';
    nbaComBoxScore.gameId=d.gameId;
    nbaComBoxScore.gameStatus=d.game.gameStatus??null;
    nbaComBoxScore.players=[...(d.game.homeTeam?.players||[]),
     ...(d.game.awayTeam?.players||[])].map(p=>({
      name:p.name||p.firstName+' '+p.familyName,personId:p.personId,
      played:p.played===true||p.played==='1'||p.played===1,
      starter:p.starter===true||p.starter==='1'||p.starter===1,
      points:p.statistics?.points??null,rebounds:p.statistics?.reboundsTotal??null,
      assists:p.statistics?.assists??null,threes:p.statistics?.threePointersMade??null,
      minutes:p.statistics?.minutes??null}));
   }
  }catch{ /* Keep ESPN data intact when NBA.com is unavailable. */ }
 }
 // Live box-score values are only observations for completed/in-progress
 // games. Never apply the current matchup's live stats to a pregame forecast.
 const boxScoreObservations=nbaComBoxScore.status==='CONNECTED'?
  nbaComBoxScore.players.filter(p=>p.personId&&p.played===true):[];
 const crossCheckedProjections=nbaCrossCheckProjections(evidence.playerProjections||[],nbaComPlayerLogs);
 const nbaComIntegrationAudit={
  scoreboardStatus:nbaComEvidence.status,
  boxScoreStatus:nbaComBoxScore.status,
  livePlayerObservations:boxScoreObservations.length,
  historicalPlayerLogs:nbaComPlayerLogs.length,
  historicalSampleCount:nbaComPlayerLogs.reduce((sum,p)=>sum+(p.samples||0),0),
  verifiedCompletedScoreboardGames:nbaComVerifiedCompletedGames.length,
  historicalSampleCountsByPlayer:nbaComPlayerLogs.map(p=>({name:p.name,samples:p.samples})),
  insufficientHistoricalSamples:nbaComPlayerLogs.filter(p=>p.samples<1).length,
  sportsDataResearchGate,
  blendedProjectionCount:crossCheckedProjections.filter(p=>p.nbaComCrossCheck?.appliedToProjection===true).length,
  status:crossCheckedProjections.some(p=>p.nbaComCrossCheck?.appliedToProjection===true)?
   'NBA_COM_INFLUENCING_PROJECTIONS':'NBA_COM_BLEND_NOT_VERIFIED',
  checkedAt:new Date(now).toISOString()
 };
 console.info('[nba-com] integration_audit',JSON.stringify({
  gameId:String(game.gameId),...nbaComIntegrationAudit,
  modelVersion:NBA_PREGAME_MODEL_VERSION
 }));
 const result={...evidence,nbaComEvidence,nbaComBoxScore,boxScoreObservations,nbaComIntegrationAudit,nbaComPlayerLogs,
  nbaComCrossCheckedAt:new Date(now).toISOString(),
  playerProjections:crossCheckedProjections.map(p=>({
   ...p,starterVerified:starterMatch(p),
   starterStatus:starterMatch(p)?'CONFIRMED_STARTER':'UNCONFIRMED',
   starterSource:starterMatch(p)?'ESPN_CORE_GAME_ROSTER_STARTER_FLAG':null})),
  sgps:(evidence.sgps||[]).map(card=>{
   const legs=nbaCrossCheckProjections(card.legs||[],nbaComPlayerLogs).map(p=>({
    ...p,starterVerified:starterMatch(p),
    starterStatus:starterMatch(p)?'CONFIRMED_STARTER':'UNCONFIRMED',
    starterSource:starterMatch(p)?'ESPN_CORE_GAME_ROSTER_STARTER_FLAG':null}));
   const startersReady=selectedStarters.startersConfirmed===true&&
    legs.length>0&&legs.every(p=>p.starterVerified===true);
   return {...card,legs,
    status:card.status==='MODEL_CANDIDATE'&&eventStarters.checked===true&&!startersReady?'NOT_READY':card.status,
    publishable:false,
    starterVerificationStatus:startersReady?'GAME_SCOPED_STARTERS_CONFIRMED':'UNCONFIRMED',
    reason:card.status==='MODEL_CANDIDATE'&&eventStarters.checked===true&&!startersReady?
     'Held: not every player is verified as a starter for this specific NBA game.':card.reason};
  }),
  starterEvidence:{checked:eventStarters.checked,
   startersConfirmed:selectedStarters.startersConfirmed,
   reason:selectedStarters.reason||'UNKNOWN',teamsChecked:eventStarters.teamsChecked||0,
   teamReasons:eventStarters.teamReasons||{},
   teamRowDiagnostics:eventStarters.teamRowDiagnostics||{},
   teamCounts:eventStarters.starterCounts||{},
   source:selectedStarters.source,
   playerIds:(selectedStarters.starters||[]).map(x=>x.playerId).sort(),
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
 const hasForecasts=Array.isArray(result.playerProjections)&&
  result.playerProjections.some(p=>Number.isFinite(Number(p.projection))&&Number(p.projection)>0);
 // AI forecast commentary must not depend on SGP eligibility or book prices.
 // Only re-review when evidence changes, stage changes or a previous review failed;
 // avoid unnecessary AI calls on each 15-minute cron tick.
 const reusable=prior?.aiReview?.status==='REVIEWED'&&
  !nbaAiMatchupIdentityConflict(prior.aiReview.summary,game)&&!result.changedFromPrior&&
  prior.stage===plan.stage&&prior.modelVersion===NBA_PREGAME_MODEL_VERSION;
 if(reusable){
  result.aiReview=prior.aiReview;
  result.aiReviewed=true;
 }else if(hasForecasts&&plan.stage==='FINAL_T_MINUS_30'&&
   (result.changedFromPrior||prior?.stage!==plan.stage||
    prior?.aiReview?.status!=='REVIEWED'||
    nbaAiMatchupIdentityConflict(prior?.aiReview?.summary,game))){
  result.aiReview=await review('nba',game,result);
  result.aiReviewed=result.aiReview?.status==='REVIEWED';
 }else if(!hasForecasts){
  result.aiReview={status:'SKIPPED',reason:'No usable player forecasts; inspect ESPN completed-game and roster ingestion'};
 }else if(eligible&&plan.stage==='FINAL_T_MINUS_30'&&pregameNeedsAiReview({stage:plan.stage,
   changedFields:audit.changedFields,priorAiReviewed:false})){
  result.aiReview=await review('nba',game,result);
  result.aiReviewed=result.aiReview?.status==='REVIEWED';
 }else result.aiReview={status:'PENDING',reason:'Awaiting forecast evidence change'};
 await write(result);
 return{gameId:game.gameId,status:result.status,stage:plan.stage,revision:result.revision,
  changed:result.changedFromPrior,modelTiers:(result.sgps||[]).filter(x=>x.status==='MODEL_CANDIDATE').map(x=>x.risk),
  injuryCount:injuries.length,projectionCount:Array.isArray(result.playerProjections)?result.playerProjections.length:0,
  sampleSource:result.sampleSource||'UNAVAILABLE',samplesUsed:result.samplesUsed||0,
  changedFields:result.changedFields,
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
 if(schedules.every(x=>x.sourceFailed)){
  console.warn('[nba-collector] checkpoint_summary',JSON.stringify({shard,state:'SCOREBOARD_UNAVAILABLE',dates}));
  return res.status(503).json({ok:false,error:'nba_scoreboard_unavailable'});
 }
 const games=[...new Map(schedules.flatMap(x=>x.events||[]).map(ev=>{
  const c=ev.competitions?.[0]||{},parts=c.competitors||[],
   home=parts.find(x=>x.homeAway==='home'),away=parts.find(x=>x.homeAway==='away');
  return [String(ev.id),{gameId:String(ev.id),status:String(c.status?.type?.state||ev.status?.type?.state)==='pre'?'SCHEDULED':'CLOSED',
   kickoff:ev.date,seasonYear:ev?.season?.year||null,seasonType:ev?.season?.type||null,
   stage:ev?.season?.type===2?'REGULAR SEASON':
    ev?.season?.type===1?'PRESEASON':'OTHER',
   home:{id:String(home?.team?.id||''),abbr:home?.team?.abbreviation},
   away:{id:String(away?.team?.id||''),abbr:away?.team?.abbreviation}}]
 })).values()].filter(g=>g.status==='SCHEDULED'&&g.stage==='REGULAR SEASON'&&nbaPregameStage(g,null).stage!=='OUTSIDE_WINDOW');
 const assigned=selectedShardGames(games,shard);
 const histories=await Promise.all(assigned.map(g=>nbaReadPregame(g.gameId)));
 const pending=assigned.map((g,i)=>({gameId:g.gameId,g,prior:histories[i],plan:nbaPregameStage(g,histories[i])}))
   .filter(x=>x.plan.due);
 // Not-due games still have valid stored projections. Include them in the
 // persisted coverage audit, otherwise each 15-minute no-op erases evidence.
 const heldReports=assigned.flatMap((g,i)=>{
  const prior=histories[i];
  if(!prior||nbaPregameStage(g,prior).due)return[];
  const freshness=nbaPregameFreshness(prior,{gameStatus:g.status});
  return [{gameId:g.gameId,status:'held',stage:prior.stage,
   projectionCount:freshness.status==='CURRENT'&&Array.isArray(prior.playerProjections)?
    prior.playerProjections.length:0,
   sampleSource:prior.sampleSource||'UNAVAILABLE',
   reason:freshness.status==='CURRENT'?'Stored research snapshot is current.':
    'Stored research snapshot is stale.'}];
 });
 // If the batch times out before completion the last persisted marker shows
 // RUNNING rather than silently presenting stale successful coverage.
 const startedAt=new Date().toISOString();
 await writeCollectorAudit(collectorAuditReport('nba',shard,[],{
  due:pending.length,startedAt,state:'RUNNING'}));
 const reports=await nflRunCollectorBatch(pending,async({g,prior})=>
  nbaCollectPregame(g,{prior}),{concurrency:3});
 await writeCollectorAudit(collectorAuditReport('nba',shard,[...reports,...heldReports],{
  due:pending.length,startedAt,state:'COMPLETE'}));
 console.info('[nba-collector] checkpoint_summary',JSON.stringify({
  shard,state:'COMPLETE',scheduledGames:games.length,assignedGames:assigned.length,
  due:pending.length,attempted:reports.length,held:heldReports.length,
  projectionCount:reports.reduce((sum,r)=>sum+(Number(r?.projectionCount)||0),0),
  emptyProjectionGames:reports.filter(r=>r?.status!=='collector_error'&&!(Number(r?.projectionCount)>0)).length,
  collectorErrors:reports.filter(r=>r?.status==='collector_error').length
 }));
 return res.status(200).json({ok:true,datesChecked:dates,games:games.length,
  shard,shardsTotal:2,assignedGames:assigned.length,
  due:pending.length,checked:reports.length,results:reports,
  failed:reports.filter(r=>r?.status==='collector_error').length,
  projectionCount:reports.reduce((sum,r)=>sum+(Number(r?.projectionCount)||0),0),
  emptyProjectionGames:reports.filter(r=>r?.status!=='collector_error'&&r?.status!=='held'&&
   !(Number(r?.projectionCount)>0)).map(r=>({gameId:r.gameId,reason:r.reason||r.status,
    sampleSource:r.sampleSource||'UNAVAILABLE',samplesUsed:r.samplesUsed||0})),
  collectorErrors:reports.filter(r=>r?.status==='collector_error').map(r=>({
   gameId:r.gameId,reason:String(r.reason||r.error||'COLLECTOR_ERROR').slice(0,160)})),
  changed:reports.filter(r=>r?.changed).length,
  changedByCause:Object.fromEntries(['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS']
   .map(k=>[k,reports.filter(r=>r?.changedFields?.includes(k)).length])),
  note:'NBA model-only SGP candidates; same game is rechecked for injuries and eligible legs at 30 minutes. AI does not silently override deterministic selections.',
  checkedAt:new Date().toISOString()});
}
