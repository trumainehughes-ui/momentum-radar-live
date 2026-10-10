import {put,list} from '@vercel/blob';
import {
 nflEasternDate,nflAddDate,nflCollectorDueGames,nflTierReadiness,
 nflCollectorSnapshotReady,nflRunCollectorBatch,MAX_NFL_COLLECTOR_CONCURRENCY
} from '../lib/nfl-collector-readiness.js';
const P='momentum-history/v1/nfl-';
const day=nflEasternDate;
async function priorSnapshot(id){
 try{
  const p=P+id+'.json',x=await list({prefix:p,limit:5}),
   b=x.blobs?.find(v=>v.pathname===p);
  if(!b)return null;
  const r=await fetch(b.url,{cache:'no-store',signal:AbortSignal.timeout(6000)});
  return r.ok?r.json():null;
 }catch{return null}
}
function historySnap(g,m,prior=null){
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
  sgps.push({...s,book:'Data Model',source:'DATA_MODEL',
   legs:s.legs.map(x=>({...x,category:x.cat,
    threshold:x.cat==='td'?1:(x.analyticsThreshold??x.threshold??x.line??null),
    projectionAtLock:x.projection??x.perGame??null,
    thresholdType:x.cat==='td'?'AT_LEAST_ONE':'AT_LEAST'}))});
 }
 // Individual sportsbook lines never prove a correlated SGP price. Preserve
 // qualified book-specific candidates, but mark them unquoted and non-playable.
 for(const book of ['DraftKings','FanDuel'])for(const s of m.sgps?.[book]||[]){
  if(s.tierAssessment?.compositionOk===false||
     !Array.isArray(s.legs)||s.legs.length!==s.requiredLegs)continue;
  sgps.push({...s,book,combinedBookQuoteVerified:false,actualSgpOdds:null,
   legs:s.legs.map(x=>({...x,category:x.cat,
    threshold:x.cat==='td'?1:(x.bookOffer?.line??x.analyticsThreshold??x.threshold??null)}))});
 }
 const now=Date.now(),ms=Date.parse(g.kickoff)-now,
  stage=ms<=30*60000?'FINAL_T_MINUS_30':ms<=90*60000?'PREGAME_VALIDATION':'DAY_AHEAD_BUILD';
 return {league:'nfl',gameId:g.gameId,lockedAt:new Date().toISOString(),
  firstLockedAt:prior?.firstLockedAt||prior?.lockedAt||new Date().toISOString(),
  revision:Number(prior?.revision||0)+1,lockStage:stage,lockSource:'SERVER_COLLECTOR',
  modelTierReadiness:tiers,game:g,picks,sgps};
}
async function autoLock(base,games){
 const due=nflCollectorDueGames(games);
 return nflRunCollectorBatch(due,async g=>{
  const date=day(new Date(g.kickoff)),
   mins=(Date.parse(g.kickoff)-Date.now())/60000,
   finalCheck=mins<=30?'&finalCheck=1':'',
   url=base+'/api/nfl-markets?date='+date+'&gameId='+encodeURIComponent(g.gameId)+
    finalCheck+'&lockRun=1&ts='+Date.now();
  // A single delayed game must not exhaust the whole cron execution.
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(65000)});
  if(!r.ok)return{gameId:g.gameId,status:'markets_unavailable',httpStatus:r.status};
  const m=await r.json();
  if(!m?.ok)return{gameId:g.gameId,status:'markets_unavailable'};
  const prior=await priorSnapshot(g.gameId);
  const snap=historySnap(g,m,prior);
  if(!nflCollectorSnapshotReady(snap))
   return{gameId:g.gameId,status:'no_qualified_model_data',
    modelTierReadiness:snap.modelTierReadiness};
  await put(P+g.gameId+'.json',JSON.stringify(snap),
   {access:'public',addRandomSuffix:false,allowOverwrite:true});
  return {gameId:g.gameId,status:prior?'updated':'locked',
   stage:snap.lockStage,revision:snap.revision,picks:snap.picks.length,
   sgps:snap.sgps.length,modelTierReadiness:snap.modelTierReadiness};
 },{concurrency:MAX_NFL_COLLECTOR_CONCURRENCY});
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const date=String(req.query?.date||''),cron=String(req.query?.cron||'')==='1'||
  Boolean(req.headers?.['x-vercel-cron']);
 const base='https://'+String(req.headers?.host||'momentum-radar-live.vercel.app');
 try{
  const today=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:day(new Date());
  // Sunday and Monday are separate ESPN date scopes; on Sunday the cron must
  // also prepare Monday instead of stopping at a nonempty Sunday schedule.
  const dates=cron?[today,nflAddDate(today,1)]:date?[today]:[today];
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
  if(!games.length)blocking.push('games');
  // /api/nfl-schedule explicitly delegates sportsbook markets to the
  // separate /api/nfl-markets route; "markets.available=false" there does
  // NOT prove that the market route is down.
  let historyLocks=[];
  if(cron&&games.length)historyLocks=await autoLock(base,games);
  if(historyLocks.some(x=>!['locked','updated'].includes(x.status)))
   degraded.push('pregame_collection');
  return res.status(blocking.length?503:200).json({
   ok:!blocking.length,date:today,datesChecked:dates,
   week:schedules.find(x=>x.week)?.week||null,games:games.length,
   markets:{status:'SEPARATE_SERVICE',verifiedByHealth:false},
   playbook:{configured:Boolean(process.env.PLAYBOOK_API_KEY)},
   blocking,degraded,historyLocks,
   collector:{gamesDue:cron?nflCollectorDueGames(games).length:0,
    attempted:historyLocks.length,completed:historyLocks.filter(x=>['locked','updated'].includes(x.status)).length,
    failed:historyLocks.filter(x=>!['locked','updated'].includes(x.status)).length,
    concurrency:MAX_NFL_COLLECTOR_CONCURRENCY},
   collectorVersion:'history-v3-isolated-slates-and-tier-readiness',
   checkedAt:new Date().toISOString()
  });
 }catch(e){
  return res.status(503).json({ok:false,date,blocking:['health_check_failed'],
   degraded:[],detail:String(e?.message||e).slice(0,160)});
 }
}
