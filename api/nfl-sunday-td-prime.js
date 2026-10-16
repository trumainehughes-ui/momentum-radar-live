// Friday-only signed pregame model primer: generate ESPN TD scoring snapshots
// for every scheduled Sunday NFL game BEFORE the existing 30-hour collector.
// Distinct from Saturday's budgeted sportsbook checkpoints and SGP quotes.
import {timingSafeEqual} from 'node:crypto';
import {nflRunCollectorBatch} from '../lib/nfl-collector-readiness.js';
import {nflFridaySundayDate,sundayTdPrimerGames} from '../lib/nfl-sunday-td-primer-policy.js';

const authorized=(req,secret)=>{
 if(!secret)return false;
 const actual=Buffer.from(String(req.headers?.authorization||'')),
  expected=Buffer.from('Bearer '+secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!authorized(req,process.env.CRON_SECRET))
  return res.status(401).json({ok:false,error:'cron_auth_required'});
 // The preview environment must never prewarm production or spend API calls.
 if(process.env.VERCEL_ENV!=='production'||
    process.env.VERCEL_PROJECT_PRODUCTION_URL!=='momentum-radar-live.vercel.app')
  return res.status(503).json({ok:false,error:'production_origin_unavailable'});
 const shard=Number(req.query?.shard);
 if(!Number.isInteger(shard)||shard<0||shard>1)
  return res.status(400).json({ok:false,error:'invalid_shard'});
 const date=nflFridaySundayDate();
 if(!date)return res.status(200).json({ok:true,status:'NOT_FRIDAY',shard,
  note:'Sunday scorer priming is restricted to Fridays.'});
 const base='https://momentum-radar-live.vercel.app';
 try{
  const sr=await fetch(base+'/api/nfl-schedule?date='+date,{
   cache:'no-store',signal:AbortSignal.timeout(14000)
  });
  if(!sr.ok)return res.status(503).json({ok:false,error:'schedule_unavailable',shard,date});
  const data=await sr.json();
  if(data?.ok!==true||data.date!==date)
   return res.status(503).json({ok:false,error:'schedule_unverified',shard,date});
  const games=sundayTdPrimerGames(data.games,shard,{limit:16});
  if(!games.length)return res.status(200).json({ok:true,status:'NO_SUNDAY_GAMES',
   shard,date,games:0});
  const reports=await nflRunCollectorBatch(games,async g=>{
   const url=base+'/api/nfl-markets?date='+date+
    '&gameId='+encodeURIComponent(g.gameId)+'&modelOnly=1';
   const response=await fetch(url,{
    cache:'no-store',headers:{Authorization:'Bearer '+process.env.CRON_SECRET},
    signal:AbortSignal.timeout(65000)
   });
   if(!response.ok)return{gameId:g.gameId,status:'MARKET_UNAVAILABLE',
    httpStatus:Number(response.status)||null};
   const body=await response.json();
   if(body?.ok!==true||String(body.gameId)!==String(g.gameId))
    return{gameId:g.gameId,status:'MARKET_IDENTITY_MISMATCH'};
   const model=(body.categories?.td||[]).filter(x=>
    x?.tdModelStatus==='ESPN_MATCHUP_MODEL'&&x.modelOnly===true);
   const injuryChecked=body.validation?.injuryEligibilityChecked===true;
   return{gameId:g.gameId,
    status:injuryChecked&&model.length?'MODEL_TD_READY':'TD_EVIDENCE_INCOMPLETE',
    tdCandidates:injuryChecked?model.length:0,injuryChecked};
  },{concurrency:3});
  const success=reports.filter(x=>x.status==='MODEL_TD_READY').length,
   failed=reports.length-success;
  return res.status(failed?503:200).json({ok:failed===0,
   status:failed?'PARTIAL':'MODELS_PREPARED',date,shard,
   scheduledForShard:games.length,successful:success,failed,
   reports,paidProviderUsed:false,
   note:'This prepares ESPN scoring research only. Saturday injury/role refresh and verified DraftKings/FanDuel odds remain independent.'});
 }catch{
  return res.status(503).json({ok:false,error:'primer_temporarily_unavailable',
   date,shard,paidProviderUsed:false});
 }
}
