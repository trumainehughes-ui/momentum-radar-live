// Safe operational status: no secrets, provider calls, paid credits, Blob I/O,
// or user information. Does not claim an upstream feed or SGP is live.
export function pregameReadiness(env={}){
 const cron=Boolean(env.CRON_SECRET),storage=Boolean(env.BLOB_READ_WRITE_TOKEN);
 const available=cron&&storage;
 return{ok:true,status:available?'CONFIGURED':'BLOCKED',
  storage:{configured:storage,validated:false,
   note:storage?'A credential is configured; a successful Blob read/write must still be confirmed.':
    'BLOB_READ_WRITE_TOKEN is missing. Pregame snapshots cannot be persisted.'},
  nfl:{cronConfigured:cron,collectorReady:available,modelRefreshMinutes:15,
   tMinus30Policy:'Recalculate only from verified injury/roster evidence; AI review advisory only'},
  nba:{cronConfigured:cron,collectorReady:available,modelRefreshMinutes:15,
   dayAheadPolicy:'ESPN completed game samples and current rosters; candidates may remain Not Ready',
   sportsbookOddsVerified:false},
  ballDontLieFree:{dailyCacheReady:available,paidStatsOrPropEndpointsUsed:false},
  nextStep:available?'Check the next scheduled collector run and saved snapshot.':
   'Attach an existing Vercel Blob store to the project and confirm its BLOB_READ_WRITE_TOKEN is available to Production.'};
}
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 return res.status(200).json(pregameReadiness(process.env));
}
