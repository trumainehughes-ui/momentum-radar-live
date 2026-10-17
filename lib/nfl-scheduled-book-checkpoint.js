import {randomBytes} from 'node:crypto';
import {put,list} from '@vercel/blob';
import {classifyNflCheckpointMarket,sanitizeNflCheckpointOutcome} from './nfl-checkpoint-outcome.js';
import {nflEasternDate,nflAddDate} from './nfl-collector-readiness.js';

// A PropLine checkpoint may use at most 2 market requests + 3 correlated
// quote requests. Fifteen atomic UTC-day reservations bound scheduled
// requests to 75 per day, leaving headroom in a 100-call/day plan.
// Injury-change auth has a separate, previously established path.
export const NFL_CHECKPOINT_DAILY_SLOTS=15;
export const NFL_CHECKPOINT_MAX_QUOTES=3;
const ROOT='momentum-nfl-checkpoints/v1/';
const TOKEN_ROOT='momentum-nfl-change-tokens/v1/';
export function nflPricingCheckpointStage(game,{now=Date.now()}={}){
 const kickoff=Date.parse(String(game?.kickoff||''));
 if(!/^\d{7,12}$/.test(String(game?.gameId||''))||
   game?.status!=='SCHEDULED'||!Number.isFinite(kickoff)||
   !Number.isFinite(now)||kickoff<=now)return null;
 const mins=(kickoff-now)/60000;
 if(mins<=30)return 'FINAL_T_MINUS_30';
 // Day before the kickoff in the NFL's Eastern-local game calendar.
 if(nflAddDate(nflEasternDate(new Date(now)),1)===
    nflEasternDate(new Date(kickoff))&&mins<=30*60)
  return 'DAY_AHEAD';
 return null;
}
export function validNflCheckpointToken(record,gameId,{now=Date.now()}={}){
 if(record?.source!=='NFL_SCHEDULED_CHECKPOINT'||
   String(record.gameId)!==String(gameId)||record.maxQuotes!==NFL_CHECKPOINT_MAX_QUOTES||
   !['DAY_AHEAD','FINAL_T_MINUS_30'].includes(record.checkpointStage))
  return false;
 const created=Date.parse(record.createdAt||''),kickoff=Date.parse(record.kickoff||'');
 if(!Number.isFinite(created)||!Number.isFinite(kickoff)||
    created>now||now-created>15*60_000||kickoff<=created||
    kickoff<=now)return false;
 return nflPricingCheckpointStage({gameId,status:'SCHEDULED',kickoff:record.kickoff},{now:created})===
  record.checkpointStage;
}
export async function runNflScheduledBookCheckpoint(game,{
 base,secret,configured=false,now=Date.now(),putBlob=put,
 fetchMarket=fetch,listBlobs=list,fetchBlob=fetch,
 createToken=()=>randomBytes(32).toString('hex')
}={}){
 const stage=nflPricingCheckpointStage(game,{now});
 if(!stage)return{status:'NOT_DUE',stage:null,marketResponse:null};
 if(!secret||!configured||typeof putBlob!=='function'||
   typeof fetchMarket!=='function')return{status:'NOT_CONFIGURED',stage,marketResponse:null};
 const gameId=String(game.gameId),kickoff=String(game.kickoff);
 let origin;
 try{
  const u=new URL(base);
  if(u.protocol!=='https:'||u.username||u.password||u.port||
     u.pathname!=='/'||u.search||u.hash||
     !(u.hostname==='momentum-radar-live.vercel.app'||
       /^momentum-radar-live-[a-z0-9-]+\.vercel\.app$/.test(u.hostname)))
   throw Error('untrusted');
  origin=u.origin;
 }catch{return{status:'UNTRUSTED_ORIGIN',stage,marketResponse:null};}
 // Keep the first attempt's safe result for later 15-minute collector audits.
 // This is observational only; it cannot ever regenerate authorization.
 const resultPath=ROOT+'outcomes/'+gameId+'/'+stage+'.json';
 const finalize=async(status,marketResponse=null,details={})=>{
  const safe=sanitizeNflCheckpointOutcome({gameId,stage,status,
   ...details});
  if(safe){
   try{await putBlob(resultPath,JSON.stringify({...safe,checkedAt:new Date(now).toISOString()}),
     {access:'public',addRandomSuffix:false,allowOverwrite:true});}
   catch{/* A missing audit must never allow a stage to spend twice. */}
  }
  return{status,stage,marketResponse,outcomeStatus:safe?.status||null,
   nativeOfferRows:safe?.nativeOfferRows||0,
   verifiedBookTiers:safe?.verifiedBookTiers||0};
 };
 // Fail closed: only a successful create-only stage claim can authorize spend.
 const stagePath=ROOT+'stages/'+gameId+'/'+stage+'.json';
 try{await putBlob(stagePath,JSON.stringify({gameId,stage,kickoff,at:new Date(now).toISOString()}),
  {access:'public',addRandomSuffix:false,allowOverwrite:false});}
 catch{
  let firstOutcome=null;
  try{
   const found=await listBlobs({prefix:resultPath,limit:3});
   const item=found.blobs?.find(b=>b.pathname===resultPath);
   if(item){
    const response=await fetchBlob(item.url,{cache:'no-store',signal:AbortSignal.timeout(3500)});
    if(response.ok){
     const saved=await response.json();
     if(String(saved.gameId)===gameId)
      firstOutcome=sanitizeNflCheckpointOutcome(saved);
    }
   }
  }catch{/* A failed audit read is not permission to retry paid calls. */}
  return{status:'ALREADY_ATTEMPTED_OR_STORE_UNAVAILABLE',stage,marketResponse:null,
   priorAttemptOutcome:firstOutcome?.status||null,
   nativeOfferRows:firstOutcome?.nativeOfferRows||0,
   verifiedBookTiers:firstOutcome?.verifiedBookTiers||0};
 }
 const utcDay=new Date(now).toISOString().slice(0,10);
 let slot=-1;
 const first=Number(BigInt(gameId)%BigInt(NFL_CHECKPOINT_DAILY_SLOTS));
 for(let n=0;n<NFL_CHECKPOINT_DAILY_SLOTS;n++){
  const index=(first+n)%NFL_CHECKPOINT_DAILY_SLOTS;
  try{
   await putBlob(ROOT+'budget/'+utcDay+'/'+index+'.json',
    JSON.stringify({gameId,stage,at:new Date(now).toISOString()}),
    {access:'public',addRandomSuffix:false,allowOverwrite:false});
   slot=index;break;
  }catch{/* occupied or store unavailable: never bypass budget */}
 }
 if(slot<0)return finalize('DAILY_CHECKPOINT_BUDGET_EXHAUSTED');
 const token=createToken();
 if(!/^[a-f0-9]{64}$/.test(String(token||'')))
  return finalize('TOKEN_UNAVAILABLE');
 const record={gameId,source:'NFL_SCHEDULED_CHECKPOINT',checkpointStage:stage,
  kickoff,createdAt:new Date(now).toISOString(),changeCount:0,
  maxQuotes:NFL_CHECKPOINT_MAX_QUOTES};
 try{await putBlob(TOKEN_ROOT+token+'.json',JSON.stringify(record),
  {access:'public',addRandomSuffix:false,allowOverwrite:false});}
 catch{return finalize('TOKEN_STORE_UNAVAILABLE');}
 const date=nflEasternDate(new Date(kickoff));
 const url=origin+'/api/nfl-markets?date='+date+'&gameId='+gameId+
  '&verifiedChange=1&changeType=scheduled_checkpoint&checkpointStage='+stage+
  (stage==='FINAL_T_MINUS_30'?'&finalCheck=1':'');
 try{
  const response=await fetchMarket(url,{cache:'no-store',headers:{
   Authorization:'Bearer '+secret,'x-momentum-change-token':token},
   signal:AbortSignal.timeout(62000)});
  if(!response.ok){
   let refreshFailureStage=null;
   try{const failed=await response.json();refreshFailureStage=typeof failed?.refreshFailureStage==='string'?failed.refreshFailureStage:null;}catch{}
   return finalize('MARKET_REFRESH_UNAVAILABLE',null,{
    refreshHttpStatus:response.status,refreshFailureStage
   });
  }
  const market=await response.json();
  if(market?.ok!==true||String(market.gameId)!==gameId)
   return finalize('MARKET_RESPONSE_UNVERIFIED');
  const evidence=classifyNflCheckpointMarket(market);
  const result=await finalize(evidence.status,market,evidence);
  return {...result,status:'MARKET_REFRESHED'};
 }catch{return finalize('MARKET_REFRESH_UNAVAILABLE');}
}
