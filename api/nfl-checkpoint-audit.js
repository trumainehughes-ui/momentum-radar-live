// Read-only checkpoint audit. Never claims a stage or invokes paid providers.
import {list} from '@vercel/blob';
import {sanitizeNflCheckpointOutcome} from '../lib/nfl-checkpoint-outcome.js';
const ROOT='momentum-nfl-checkpoints/v1/';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const gameId=String(req.query?.gameId||'');
 if(!/^\d{7,12}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_game_id'});
 try{
  const stages=await Promise.all(['DAY_AHEAD','FINAL_T_MINUS_30'].map(async stage=>{
   const prefix=ROOT+'outcomes/'+gameId+'/'+stage+'.json';
   const found=await list({prefix,limit:3});
   const item=found.blobs?.find(x=>x.pathname===prefix);
   if(!item)return{stage,status:'NO_RECORDED_OUTCOME'};
   const response=await fetch(item.url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
   if(!response.ok)return{stage,status:'OUTCOME_UNAVAILABLE'};
   const raw=await response.json();
   const safe=sanitizeNflCheckpointOutcome(raw);
   return safe&&safe.stage===stage&&safe.gameId===gameId?
    {...safe,checkedAt:typeof raw.checkedAt==='string'?raw.checkedAt:null}:
    {stage,status:'OUTCOME_INVALID'};
  }));
  return res.status(200).json({ok:true,gameId,stages,
   note:'Read-only stored outcome evidence; absence does not prove that a checkpoint was never attempted. No sportsbook requests made.'});
 }catch{return res.status(503).json({ok:false,error:'checkpoint_audit_unavailable'});}
}
