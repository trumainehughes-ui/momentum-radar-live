import {blobStorageReadiness} from '../lib/blob-storage-config.js';
// Safe operational status: no secrets, provider calls, paid credits, Blob I/O,
// or user information. Does not claim an upstream feed or SGP is live.
export function pregameReadiness(env={}){
 const cron=Boolean(env.CRON_SECRET),storage=blobStorageReadiness(env);
 const available=cron&&storage.configured;
 return{ok:true,status:available?'CONFIGURED':'BLOCKED',storage,
  nfl:{cronConfigured:cron,collectorReady:available,modelRefreshMinutes:15,
   tMinus30Policy:'Recalculate only from verified injury/roster evidence; AI review advisory only'},
  nba:{cronConfigured:cron,collectorReady:available,modelRefreshMinutes:15,
   dayAheadPolicy:'ESPN completed game samples and current rosters; candidates may remain Not Ready',
   sportsbookOddsVerified:false},
  ballDontLieFree:{dailyCacheReady:available,paidStatsOrPropEndpointsUsed:false},
  nextStep:available?'Check the next scheduled collector run and saved snapshot.':
   'Ensure the existing Vercel Blob store is attached. Either modern BLOB_STORE_ID with Vercel OIDC or a legacy BLOB_READ_WRITE_TOKEN is supported.'};
}
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 return res.status(200).json(pregameReadiness(process.env));
}
