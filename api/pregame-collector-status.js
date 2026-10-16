// Read-only operational audit for both scheduled league collectors.
// No external scoreboard, sportsbook, AI, paid API or data mutation.
import {readCollectorAudits} from '../lib/pregame-collector-shards.js';
import {NFL_CHECKPOINT_DAILY_SLOTS,NFL_CHECKPOINT_MAX_QUOTES} from '../lib/nfl-scheduled-book-checkpoint.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const league=String(req.query?.league||'nfl').toLowerCase();
 if(!['nfl','nba'].includes(league))return res.status(400).json({ok:false,error:'unsupported_league'});
 const out=await readCollectorAudits(league);
 const checkpointCapacity=league==='nfl'?{
  maxPaidCheckpointsPerUtcDay:NFL_CHECKPOINT_DAILY_SLOTS,
  maxCombinedQuotesPerCheckpoint:NFL_CHECKPOINT_MAX_QUOTES,
  guaranteeAllGameStages:false,
  note:'This is a shared UTC-day paid API budget, not a per-game entitlement. A full slate can exceed the daily cap; ordinary model and injury checks do not prove a paid sportsbook refresh occurred.'
 }:null;
 return res.status(out.ok?200:503).json({...out,...(checkpointCapacity?{checkpointCapacity}:{})});
}
