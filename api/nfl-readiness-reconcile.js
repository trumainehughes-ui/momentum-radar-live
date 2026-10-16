// Cross-check collector model generation against the independently saved
// sportsbook-market snapshot. Never equate MODEL_CANDIDATE with a book quote.
import {readCollectorAudits} from '../lib/pregame-collector-shards.js';
import {nflSgpReadinessFromBlob} from '../lib/nfl-sgp-snapshot-status.js';
import {nflEasternDate} from '../lib/nfl-collector-readiness.js';
import {reconcileNflReadinessStatus} from '../lib/nfl-readiness-classification.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'invalid_date_or_game_id'});
 const parsed=Date.parse(date+'T12:00:00Z'),today=Math.floor(Date.now()/86400000);
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date||
    Math.floor(parsed/86400000)<today-2||Math.floor(parsed/86400000)>today+30)
  return res.status(400).json({ok:false,error:'date_outside_monitoring_window'});
 try{
  const base='https://'+String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'momentum-radar-live.vercel.app');
  const response=await fetch(base+'/api/nfl-schedule?date='+date,{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return res.status(503).json({ok:false,error:'schedule_unavailable'});
  const schedule=await response.json();
  const game=(schedule.games||[]).find(g=>String(g.gameId)===gameId);
  if(!game||nflEasternDate(new Date(game.kickoff))!==date)
   return res.status(422).json({ok:false,error:'game_not_on_requested_eastern_date',gameId,date});
  const [audits,market]=await Promise.all([
   readCollectorAudits('nfl'),nflSgpReadinessFromBlob({date,gameId})
  ]);
  const records=(audits.shards||[]).filter(s=>s.status==='COMPLETE')
   .flatMap(s=>(s.results||[]).filter(r=>r.gameId===gameId)
    .map(r=>({shard:s.shard,checkedAt:s.checkedAt,stage:r.stage,
     collectorStatus:r.status,modelCoverage:r.coverage,
     modelTiers:r.readyTiers||[],bookCheckpoint:r.bookCheckpoint?.status||null})));
  const latest=records.sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt))[0]||null;
  const marketStatus=market.result?.status||'UNKNOWN';
  const quoteVerified=market.result?.sportsbookCombinedOddsVerified===true;
  const status=reconcileNflReadinessStatus({marketStatus,quoteVerified,
   collectorCoverage:latest?.modelCoverage||null});
  return res.status(200).json({ok:true,gameId,date,status,
   collector:latest,market:{status:marketStatus,
    sportsbookCombinedOddsVerified:quoteVerified,
    tiers:market.result?.tiers||[]},
   publishable:quoteVerified,
   note:'Collector models and market snapshots use separate storage. No model-only candidate is a sportsbook-verified ticket.'});
 }catch{return res.status(503).json({ok:false,error:'readiness_reconciliation_unavailable'})}
}
