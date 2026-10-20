import {readCollectorAudits} from '../lib/pregame-collector-shards.js';
import {publicNbaCollectorHealth} from '../lib/public-nba-collector-health.js';
// Read-only diagnostics: no cron credentials or internal records returned.
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=60, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 try{
  const audit=await readCollectorAudits('nba');
  const shards=(audit.shards||[]).map(shard=>({
   shard:shard.shard,status:shard.status,
   checkedAt:shard.checkedAt||null,due:shard.due||0,
   ...publicNbaCollectorHealth(shard)
  }));
  return res.status(200).json({ok:true,league:'nba',shards,
   note:'Research-only projection coverage; no starter, sportsbook or SGP verification implied.'});
 }catch{
  return res.status(503).json({ok:false,error:'nba_collector_audit_unavailable'});
 }
}
