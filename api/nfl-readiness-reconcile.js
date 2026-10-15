// Cross-check collector model generation against the independently saved
// sportsbook-market snapshot. Never equate MODEL_CANDIDATE with a book quote.
import {readCollectorAudits} from '../lib/pregame-collector-shards.js';
import {nflSgpReadinessFromBlob} from '../lib/nfl-sgp-snapshot-status.js';
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
  const status=quoteVerified?'BOOK_QUOTED':
   latest?.modelCoverage==='READY_3_OF_3'&&marketStatus==='PENDING_SNAPSHOT'?
    'MODEL_READY_MARKET_SNAPSHOT_MISSING':
   latest?.modelCoverage==='READY_3_OF_3'?'MODEL_ONLY':'NOT_READY';
  return res.status(200).json({ok:true,gameId,date,status,
   collector:latest,market:{status:marketStatus,
    sportsbookCombinedOddsVerified:quoteVerified,
    tiers:market.result?.tiers||[]},
   publishable:quoteVerified,
   note:'Collector models and market snapshots use separate storage. No model-only candidate is a sportsbook-verified ticket.'});
 }catch{return res.status(503).json({ok:false,error:'readiness_reconciliation_unavailable'})}
}
