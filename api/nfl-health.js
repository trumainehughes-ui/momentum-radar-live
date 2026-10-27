import {validateSportsResearchEvidence} from '../lib/sports-data-registry.js';
import {put,list} from '@vercel/blob';
import {blobCredentialMode} from '../lib/blob-storage-config.js';
import {timingSafeEqual} from 'node:crypto';
import {pregameAiAudit} from '../lib/pregame-ai-review.js';
import {nflDayAheadAiReviewDue} from '../lib/nfl-scheduled-ai-review.js';
import {pregameEvidenceAudit,pregameNeedsAiReview,pregamePhase}
 from '../lib/pregame-revalidation.js';
import {selectedShardGames,collectorAuditReport,writeCollectorAudit}
 from '../lib/pregame-collector-shards.js';
import {checkNflScheduledInjuryChanges} from '../lib/nfl-scheduled-injury-watch.js';
import {runNflScheduledBookCheckpoint} from '../lib/nfl-scheduled-book-checkpoint.js';
import {nflCollectionForecast} from '../lib/nfl-slate-collection-forecast.js';
import {nflModelSgpRevisionAudit,nflSafeSgpRevisionAudit} from '../lib/nfl-model-sgp-revision-audit.js';
import {
 nflEasternDate,nflAddDate,nflCollectorDueGames,nflTierReadiness,
 nflCollectorSnapshotReady,nflRunCollectorBatch,nflMarketFailureDetails,MAX_NFL_COLLECTOR_CONCURRENCY
} from '../lib/nfl-collector-readiness.js';
const P='momentum-history/v1/nfl-';
const day=nflEasternDate;
export function nflCronAuthorized(req,secret){
 if(!secret)return false;
 const got=Buffer.from(String(req?.headers?.authorization||'')),
  expected=Buffer.from('Bearer '+secret);
 return got.length===expected.length&&timingSafeEqual(got,expected);
}
async function priorSnapshot(id){
 try{
  const p=P+id+'.json',x=await list({prefix:p,limit:5}),
   b=x.blobs?.find(v=>v.pathname===p);
  if(!b)return null;
  const r=await fetch(b.url,{cache:'no-store',signal:AbortSignal.timeout(6000)});
  return r.ok?r.json():null;
 }catch{return null}
}
export function historySnap(g,m,prior=null){
 const picks=[];
 for(const cat of ['td','passing','rushing','receiving','receptions'])
  for(const x of m.categories?.[cat]||[]){
   const raw=cat==='td'?1:(x.analyticsThreshold??x.threshold??x.line??null),
    target=Number(raw);
   if(!Number.isFinite(target)||target<=0)continue;
   picks.push({...x,category:cat,threshold:target,
    projectionAtLock:x.projection??x.perGame??null,
    thresholdType:cat==='td'?'AT_LEAST_ONE':'AT_LEAST'});
  }
 const tiers=nflTierReadiness(m);
 const sgps=[];
 for(const s of m.sgps?.Analytics||[]){
  if(tiers[s.risk]?.status!=='MODEL_CANDIDATE')continue;
  sgps.push({...s,book:'Data Model',source:'DATA_MODEL',combinedBookQuoteVerified:false,actualSgpOdds:null,publishable:false,
   legs:s.legs.map(x=>({...x,category:x.cat,
    threshold:x.cat==='td'?1:(x.analyticsThreshold??x.threshold??x.line??null),
    projectionAtLock:x.projection??x.perGame??null,
    thresholdType:x.cat==='td'?'AT_LEAST_ONE':'AT_LEAST'}))});
 }
 // When the markets endpoint cannot produce a complete model tier, generate
 // a clearly unquoted research combination from its vetted game player pool.
 // This never claims an offered sportsbook line or combined parlay price.
 const categories=m.categories||{};
 const usedTierKeys=[];
 const plans=[['Small',4],['Medium',5],['Nuke',7]];
 for(const [risk,count] of plans){
  if(sgps.some(s=>s.risk===risk))continue;
  const selected=[],keys=new Set(),athletes=new Map();
  const options=Object.entries({passing:categories.passing||[],rushing:categories.rushing||[],
   receiving:categories.receiving||[],receptions:categories.receptions||[]})
   .flatMap(([cat,rows])=>rows.map(x=>({...x,cat})))
   .filter(x=>String(x.playerID||x.playerId||'')&&String(x.team||'')&&
    !/\b(OUT|INACTIVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED)\b/i.test(
     [x.injuryStatus,x.availability,x.starterStatus].join(' '))&&
    Number(x.projection??x.perGame)>0);
  const choose=(cat)=>{
   const rows=options.filter(x=>x.cat===cat).sort((a,b)=>{
    const key=x=>String(x.playerID||x.playerId)+'|'+x.cat;
    const overlap=x=>usedTierKeys.filter(t=>t.has(key(x))).length;
    return overlap(a)-overlap(b)||(Number(b.confidence)||0)-(Number(a.confidence)||0)||
     (Number(b.projection??b.perGame)||0)-(Number(a.projection??a.perGame)||0);
   });
   for(const x of rows){
    const id=String(x.playerID||x.playerId),key=id+'|'+cat;
    if(keys.has(key)||(athletes.get(id)||0)>=2)continue;
    const projection=Number(x.projection??x.perGame);
    const factor=risk==='Small'?.72:risk==='Medium'?.96:1.22;
    const raw=projection*factor;
    const threshold=cat==='receptions'?Math.max(1,Math.floor(raw)):
     Math.max(5,Math.floor(raw/5)*5);
    if(!Number.isFinite(threshold)||threshold<=0)continue;
    selected.push({...x,category:cat,analyticsThreshold:threshold,threshold,
     projectionAtLock:projection,sportsbookVerified:false,marketSelectionStatus:'MODEL_ONLY_NOT_BOOK_VERIFIED'});
    keys.add(key);athletes.set(id,(athletes.get(id)||0)+1);return true;
   }
   return false;
  };
  const hasCore=['passing','rushing','receiving'].every(choose);
  if(!hasCore)continue;
  for(const cat of ['receptions','receiving','rushing','passing','receptions','receiving','rushing'])
   if(selected.length<count)choose(cat);
  if(selected.length!==count)continue;
  usedTierKeys.push(keys);
  sgps.push({risk,book:'Data Model',source:'PLUGIN_COMPATIBLE_MODEL_FALLBACK',
   mode:'MODEL_ONLY',modelOnly:true,publishable:false,combinedBookQuoteVerified:false,
   actualSgpOdds:null,estimatedOdds:null,requiredLegs:count,legs:selected,
   tierAssessment:{compositionOk:true,reason:'Complete unquoted predictive model'},
   explanation:{summary:'AI model research using matchup-adjusted player projections. Targets are not verified sportsbook offers.'},
   reason:'Predictive research only; check actual offered lines and correlated SGP odds before betting.'});
 }
 // Individual sportsbook lines never prove a correlated SGP price. Preserve
 // qualified book-specific candidates, but mark them unquoted and non-playable.
 for(const book of ['DraftKings','FanDuel'])for(const s of m.sgps?.[book]||[]){
  if(s.tierAssessment?.compositionOk===false||
     !Array.isArray(s.legs)||s.legs.length!==s.requiredLegs||
     s.legs.some(x=>x.cat!=='td'&&(x.bookOffer?.line===null||x.bookOffer?.line===undefined||String(x.bookOffer.line).trim()===''||!Number.isFinite(Number(x.bookOffer.line)))))continue;
  sgps.push({...s,book,combinedBookQuoteVerified:false,actualSgpOdds:null,
   legs:s.legs.map(x=>({...x,category:x.cat,
    threshold:x.cat==='td'?1:(x.bookOffer?.line??null)}))});
 }
 // Carry only source-backed, fresh individual offers to the AI guardian.
 // The review is advisory; it must never convert them to a combined SGP quote.
 const verifiedIndividualOffers=[];
 for(const cat of ['td','passing','rushing','receiving','receptions'])
  for(const row of m.categories?.[cat]||[]){
   for(const book of ['DraftKings','FanDuel']){
    const offer=row.sportsbooks?.[book]||row.books?.find?.(x=>x.book===book);
    if(!offer?.sourceUrl||!offer?.checkedAt||!offer?.available)continue;
    if(cat!=='td'&&(offer.line===null||offer.line===undefined||String(offer.line).trim()===''||!Number.isFinite(Number(offer.line))))continue;
    const n=Number(offer.odds);
    if(!Number.isFinite(n)||n===0)continue;
    verifiedIndividualOffers.push({book,sport:'NFL',gameId:g.gameId,
     playerId:String(row.playerID||row.playerId||''),market:cat,
     line:cat==='td'?'yes':String(offer.line),
     americanOdds:(n>0?'+':'')+String(n),checkedAt:offer.checkedAt,
     sourceUrl:offer.sourceUrl,available:true});
   }
  }
 const now=Date.now(),ms=Date.parse(g.kickoff)-now,
  stage=ms<=45*60000?'FINAL_T_MINUS_30':ms<=90*60000?'PREGAME_VALIDATION':'DAY_AHEAD_BUILD';
 return {league:'nfl',gameId:g.gameId,lockedAt:new Date().toISOString(),
  firstLockedAt:prior?.firstLockedAt||prior?.lockedAt||new Date().toISOString(),
  revision:Number(prior?.revision||0)+1,lockStage:stage,lockSource:'SERVER_COLLECTOR',
  modelTierReadiness:tiers,modelDataStatus:nflCollectorSnapshotReady({picks,sgps})?'MODEL_ONLY':'NOT_READY',
  injuryChecks:{rosterAndInjuryEligibilityChecked:m.validation?.injuryEligibilityChecked===true,
    blockedPlayerCount:Number(m.validation?.blockedPlayerCount)||0,
    officialInactivesVerified:false},
  checkedAt:new Date().toISOString(),game:g,picks,sgps,verifiedIndividualOffers,
  injuryEvidence:m.validation?.injuryEvidence||[],
  matchupEvidence:m.matchupEvidence||m.outcomePrediction||null,
  offenseDefense:m.matchupEvidence||m.outcomePrediction||null,
  modelVersion:'nfl-2026-bilateral-matchup-review-v1',
  propCategories:['td','passing','rushing','receiving','receptions']};
}
async function autoLock(base,games){
 const due=nflCollectorDueGames(games);
 return nflRunCollectorBatch(due,async g=>{
  // Every due game gets a free ESPN injury-status comparison, including the
  // day-ahead and T-minus-30 checks. Only material verified changes can mint
  // the single-use PropLine token and trigger an authorized market rebuild.
  const injuryWatch=await checkNflScheduledInjuryChanges(g,{
   base,cronSecret:process.env.CRON_SECRET
  });
  // No duplicate scheduled spend when a verified injury event is already
  // driving its own independent paid/quoted rebuild for this matchup.
  // A minted injury token alone does not prove the signed rebuild worked.
  // If that call failed, allow the independent one-use, daily-capped
  // pregame checkpoint instead of silently skipping an eligible window.
  const bookCheckpoint=injuryWatch.tokenIssued&&
   injuryWatch.modelRefreshStatus==='completed'?{
   status:'SKIPPED_VERIFIED_INJURY_REFRESH',stage:null,marketResponse:null
  }:await runNflScheduledBookCheckpoint(g,{
   base,secret:process.env.CRON_SECRET,
   configured:Boolean(process.env.PLAYER_PROPS_API_KEY)
  });
  const date=day(new Date(g.kickoff)),
   mins=(Date.parse(g.kickoff)-Date.now())/60000,
   finalCheck=mins<=45?'&finalCheck=1':'',
   url=base+'/api/nfl-markets?date='+date+'&gameId='+encodeURIComponent(g.gameId)+
    finalCheck+'&lockRun=1&ts='+Date.now();
  // A single delayed game must not exhaust the whole cron execution.
  // Only the signed cron can request the stricter ten-minute saved-snapshot
  // freshness gate; anonymous ?lockRun=1 URLs cannot bypass the UI cache.
  // The signed checkpoint just returned a newly rebuilt market response;
  // do not immediately overwrite its real bookmaker quote with a routine
  // model-only refresh, especially at T-minus-30.
  const r=bookCheckpoint.marketResponse?null:await fetch(url,{cache:'no-store',
   headers:{Authorization:'Bearer '+process.env.CRON_SECRET},
   signal:AbortSignal.timeout(65000)});
  if(r&&!r.ok){
   const failure=await r.json().catch(()=>null);
   return{gameId:g.gameId,status:'markets_unavailable',injuryWatch,
    bookCheckpoint:{status:bookCheckpoint.status,stage:bookCheckpoint.stage,
     outcomeStatus:bookCheckpoint.outcomeStatus||null,
     priorAttemptOutcome:bookCheckpoint.priorAttemptOutcome||null,
     nativeOfferRows:bookCheckpoint.nativeOfferRows||0,
     verifiedBookTiers:bookCheckpoint.verifiedBookTiers||0},
    ...nflMarketFailureDetails(r.status,failure)};
  }
  const m=bookCheckpoint.marketResponse||await r.json();
  if(!m?.ok)return{gameId:g.gameId,status:'markets_unavailable',injuryWatch,
   bookCheckpoint:{status:bookCheckpoint.status,stage:bookCheckpoint.stage,
     outcomeStatus:bookCheckpoint.outcomeStatus||null,
     priorAttemptOutcome:bookCheckpoint.priorAttemptOutcome||null,
     nativeOfferRows:bookCheckpoint.nativeOfferRows||0,
     verifiedBookTiers:bookCheckpoint.verifiedBookTiers||0},
   ...nflMarketFailureDetails(r?.status||200,m)};
  const prior=await priorSnapshot(g.gameId);
  const snap=historySnap(g,m,prior);
  snap.sportsDataResearchGate=validateSportsResearchEvidence('NFL',{
   source:'espn',observedAt:new Date().toISOString(),records:m&&typeof m==='object'?[m]:[]
  });
  const audit=pregameEvidenceAudit(prior,snap,{league:'nfl'});
  snap.evidenceDigests=audit.evidenceDigests;
  snap.changedFields=audit.changedFields;
  snap.changedFromPrior=audit.changedFromPrior;
  snap.sgpRevisionAudit=nflSafeSgpRevisionAudit(
   nflModelSgpRevisionAudit(prior,snap,{changedFields:audit.changedFields}));
  snap.revalidationVersion=audit.modelVersion;
  snap.priorCandidateInvalidated=snap.modelDataStatus==='NOT_READY'&&prior?.modelDataStatus==='MODEL_ONLY';
  // A fresh market build recalculates TD, pass/rush/receiving/receptions and
  // all SGPs using current roster/injury/opponent evidence. Store the reasons
  // instead of silently reusing yesterday's AI review when any pick changes.
  if(!snap.sgps.length&&!snap.picks.length){
   snap.aiReview={status:'SKIPPED',reason:'No model player projections or SGP candidates to review'};
  }else if(pregameNeedsAiReview({stage:snap.lockStage,
    changedFields:audit.changedFields,
    priorAiReviewed:prior?.aiReview?.status==='REVIEWED'&&
      prior?.lockStage==='FINAL_T_MINUS_30'})||
    nflDayAheadAiReviewDue({stage:snap.lockStage,
      changedFields:audit.changedFields,prior,now:Date.now()})){
   // Signed cron: ESPN/injury & sportsbook recheck runs before this advisory
   // AI quality review. AI cannot invent or certify bookmaker prices.
   snap.aiReviewAttemptAt=new Date().toISOString();
   snap.aiReview=await pregameAiAudit('nfl',g,snap,{base});
  }else if(!audit.changedFromPrior&&snap.lockStage===prior?.lockStage){
   snap.aiReview=prior?.aiReview||{status:'PENDING',reason:'awaiting_scheduled_review'};
   snap.aiReviewAttemptAt=prior?.aiReviewAttemptAt||null;
  }else{
   snap.aiReview={status:'PENDING',reason:'new_model_evidence_pending_review'};
   snap.aiReviewAttemptAt=prior?.aiReviewAttemptAt||null;
  }
  const changed=audit.changedFromPrior;
  await put(P+g.gameId+'.json',JSON.stringify(snap),
   {access:'public',addRandomSuffix:false,allowOverwrite:true});
  return {gameId:g.gameId,injuryWatch,bookCheckpoint:{status:bookCheckpoint.status,stage:bookCheckpoint.stage,
     outcomeStatus:bookCheckpoint.outcomeStatus||null,
     priorAttemptOutcome:bookCheckpoint.priorAttemptOutcome||null,
     nativeOfferRows:bookCheckpoint.nativeOfferRows||0,
     verifiedBookTiers:bookCheckpoint.verifiedBookTiers||0},status:snap.modelDataStatus==='NOT_READY'?'no_qualified_model_data':prior?'updated':'locked',
   stage:snap.lockStage,revision:snap.revision,picks:snap.picks.length,
   sgps:snap.sgps.length,aiReview:snap.aiReview?.status||'PENDING',
   changed,changedFields:snap.changedFields,
   sgpRevisionAudit:snap.sgpRevisionAudit,
   propCategoriesUpdated:changed?snap.propCategories:[],
   matchupReviewed:true,
   modelTierReadiness:snap.modelTierReadiness,
   analyticsTierCounts:Object.fromEntries(['Small','Medium','Nuke'].map(risk=>[
    risk,(m.sgps?.Analytics||[]).filter(x=>x.risk===risk).length])),
   publicModelTierCounts:Object.fromEntries(['Small','Medium','Nuke'].map(risk=>[
    risk,snap.sgps.filter(x=>x.risk===risk&&x.source==='DATA_MODEL').length]))};
 },{concurrency:MAX_NFL_COLLECTOR_CONCURRENCY});
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const date=String(req.query?.date||''),cron=String(req.query?.cron||'')==='1'||
  Boolean(req.headers?.['x-vercel-cron']);
 // Expensive writes, sportsbook backup and full injury refresh are permitted
 // ONLY for the Vercel-signed cron, never public ?cron=1 queries.
 if(cron&&!nflCronAuthorized(req,process.env.CRON_SECRET))
  return res.status(401).json({ok:false,error:'cron_auth_required'});
 if(cron&&blobCredentialMode(process.env)==='NOT_CONFIGURED')
  return res.status(503).json({ok:false,error:'pregame_storage_not_configured',
   action:'Connect an existing Vercel Blob store to persist game-specific SGP and injury snapshots.'});
 const shard=cron?Number(req.query?.shard??0):null;
 if(cron&&(!Number.isInteger(shard)||shard<0||shard>1))
  return res.status(400).json({ok:false,error:'invalid_collector_shard'});
 // Signed cron-to-function traffic must never use an untrusted Host header.
 // This also ensures injury detector and game collector use the same release.
 const deploymentHost=String(process.env.VERCEL_URL||'').toLowerCase();
 const productionHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').toLowerCase();
 const previewHost=/^momentum-radar-live-[a-z0-9-]+\.vercel\.app$/.test(deploymentHost)?
  deploymentHost:'';
 // Prefer this exact deployment's VERCEL_URL for signed internal calls.
 // Production deployments have unique Vercel hostnames; requiring only the
 // vanity domain incorrectly blocks scheduled collectors with HTTP 503.
 const trustedHost=process.env.VERCEL_ENV==='production'?
  (previewHost||productionHost==='momentum-radar-live.vercel.app'?
   previewHost||productionHost:''):
  (process.env.VERCEL_ENV==='preview'?previewHost:'');
 if(!trustedHost)return res.status(503).json({ok:false,error:'trusted_deployment_origin_unavailable'});
 const base='https://'+trustedHost;
 try{
  const today=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:day(new Date());
  // Sunday and Monday are separate ESPN date scopes; on Sunday the cron must
  // also prepare Monday instead of stopping at a nonempty Sunday schedule.
  const dates=cron?[today,nflAddDate(today,1),nflAddDate(today,2)]:date?[today]:[today];
  const schedules=await Promise.all(dates.map(async d=>{
   try{
    const r=await fetch(base+'/api/nfl-schedule?date='+encodeURIComponent(d),
     {cache:'no-store',signal:AbortSignal.timeout(12000)});
    return r.ok?await r.json():{ok:false,date:d,games:[],error:'schedule_'+r.status};
   }catch(e){return{ok:false,date:d,games:[],error:String(e?.message||e).slice(0,80)}}
  }));
  const blocking=[],degraded=[];
  if(schedules.every(s=>!s.ok))blocking.push('schedule');
  const games=[...new Map(schedules.flatMap(s=>s.games||[]).map(g=>[String(g.gameId),g])).values()];
  // Signed collection must fail closed when the schedule is empty, but a
  // read-only public health request on an NFL off-day is healthy idle.
  if(!games.length&&cron)blocking.push('games');
  // /api/nfl-schedule explicitly delegates sportsbook markets to the
  // separate /api/nfl-markets route; "markets.available=false" there does
  // NOT prove that the market route is down.
  const collectionForecast=nflCollectionForecast(games);
  const allDue=nflCollectorDueGames(games),
   assigned=cron?selectedShardGames(allDue,shard):[];
  const startedAt=new Date().toISOString();
  if(cron)await writeCollectorAudit(collectorAuditReport('nfl',shard,[],{
   state:'RUNNING',startedAt,due:assigned.length}));
  let historyLocks=[];
  if(cron&&assigned.length)historyLocks=await autoLock(base,assigned);
  if(cron)await writeCollectorAudit(collectorAuditReport('nfl',shard,historyLocks,{
   state:'COMPLETE',startedAt,due:assigned.length}));
  // Operational observability only: no secrets, player picks or provider payloads.
  // A completed cron with zero due games is distinct from a blocked collector.
  if(cron)console.info('[nfl-collector] checkpoint_summary',JSON.stringify({
   shard,scheduledGames:games.length,due:assigned.length,
   attempted:historyLocks.length,
   statuses:historyLocks.reduce((acc,x)=>{
    const key=['locked','updated','markets_unavailable','collector_error'].includes(x?.status)?
     x.status:'other';
    acc[key]=(acc[key]||0)+1;return acc;
   },{}),
   // A successful cron run does not imply that any complete SGP was built.
   // Log counts only; no athlete identities, selections or sportsbook data.
   emptyModelTierRefreshes:historyLocks.filter(x=>
    ['locked','updated'].includes(x.status)&&Number(x.sgps||0)===0).length,
   publicTierCounts:historyLocks.reduce((acc,x)=>{
    for(const risk of ['Small','Medium','Nuke']){
     const key=risk;
     acc[key]=(acc[key]||0)+Number(x.publicModelTierCounts?.[risk]||0);
    }
    return acc;
   },{}),
   modelTierReadinessCounts:historyLocks.reduce((acc,x)=>{
    const entries=Array.isArray(x.modelTierReadiness)?x.modelTierReadiness:
     Object.values(x.modelTierReadiness||{});
    for(const tier of entries){
     const risk=String(tier?.risk||tier?.tier||'');
     if(!['Small','Medium','Nuke'].includes(risk))continue;
     const key=risk+':'+String(tier?.status||'UNKNOWN').slice(0,40);
     acc[key]=(acc[key]||0)+1;
    }
    return acc;
   },{}),
   checkpointStatuses:historyLocks.reduce((acc,x)=>{
    const key=String(x?.bookCheckpoint?.outcomeStatus||x?.bookCheckpoint?.status||'NONE').slice(0,55);
    acc[key]=(acc[key]||0)+1;return acc;
   },{})
  }));
  if(historyLocks.some(x=>!['locked','updated'].includes(x.status)))
   degraded.push('pregame_collection');
  return res.status(blocking.length?503:200).json({
   ok:!blocking.length,date:today,datesChecked:dates,
   shard,shardsTotal:2,totalScheduledGames:games.length,
   collectionForecast,
   week:schedules.find(x=>x.week)?.week||null,games:games.length,
   markets:{status:'SEPARATE_SERVICE',verifiedByHealth:false},
   playbook:{configured:Boolean(process.env.PLAYBOOK_API_KEY)},
   blocking,degraded,historyLocks,
   collector:{gamesDue:assigned.length,allLeagueGamesDue:allDue.length,
    attempted:historyLocks.length,completed:historyLocks.filter(x=>['locked','updated'].includes(x.status)).length,
    failed:historyLocks.filter(x=>!['locked','updated'].includes(x.status)).length,
    changed:historyLocks.filter(x=>x.changed===true).length,
   sportsbookCheckpoints:{
    refreshed:historyLocks.filter(x=>x.bookCheckpoint?.status==='MARKET_REFRESHED').length,
    skipped:historyLocks.filter(x=>x.bookCheckpoint?.status==='ALREADY_ATTEMPTED_OR_STORE_UNAVAILABLE').length,
    budgetExhausted:historyLocks.filter(x=>x.bookCheckpoint?.status==='DAILY_CHECKPOINT_BUDGET_EXHAUSTED').length
   },
   injuryWatch:{
    checked:historyLocks.filter(x=>['compared','baseline_created',
     'insufficient_injury_evidence'].includes(x.injuryWatch?.status)).length,
    detected:historyLocks.filter(x=>x.injuryWatch?.changesDetected>0).length,
    tokenIssued:historyLocks.filter(x=>x.injuryWatch?.tokenIssued===true).length,
    unavailable:historyLocks.filter(x=>x.injuryWatch?.status==='DETECTOR_UNAVAILABLE').length
   },
    changedByCause:Object.fromEntries(['PLAYER_PROPS','SGP_TIERS','INJURIES','MATCHUP','MODEL_INPUTS']
      .map(k=>[k,historyLocks.filter(x=>x.changedFields?.includes(k)).length])),
    concurrency:MAX_NFL_COLLECTOR_CONCURRENCY},
   collectorVersion:'league-wide-nfl-sharded-v5-day-ahead-and-final30',
   checkedAt:new Date().toISOString()
  });
 }catch(e){
  return res.status(503).json({ok:false,date,blocking:['health_check_failed'],
   degraded:[],detail:String(e?.message||e).slice(0,160)});
 }
}
