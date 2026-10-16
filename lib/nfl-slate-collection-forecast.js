// Read-only, deterministic NFL collector coverage forecast.
// Does not invoke sportsbooks, external APIs, AI, Blob reads/writes, or crons.
import {shardForGame,COLLECTOR_SHARDS} from './pregame-collector-shards.js';
import {NFL_COLLECTOR_LOOKAHEAD_MS,nflCollectorDueGames} from './nfl-collector-readiness.js';
import {nflPricingCheckpointStage,NFL_CHECKPOINT_DAILY_SLOTS}
 from './nfl-scheduled-book-checkpoint.js';

const INTERVAL_MS=15*60_000;
const FINAL_WINDOW_MS=30*60_000;
const iso=ms=>new Date(ms).toISOString();
const tick=ms=>Math.ceil(ms/INTERVAL_MS)*INTERVAL_MS;
export function nflCollectionForecast(games,{now=Date.now()}={}){
 const entries=[],seen=new Set();
 for(const g of Array.isArray(games)?games:[]){
  const gameId=String(g?.gameId||''),ko=Date.parse(String(g?.kickoff||''));
  if(!/^\d{7,12}$/.test(gameId)||seen.has(gameId)||
     g?.status!=='SCHEDULED'||!Number.isFinite(ko))continue;
  seen.add(gameId);
  const open=ko-NFL_COLLECTOR_LOOKAHEAD_MS,final=ko-FINAL_WINDOW_MS;
  const collectorState=now>=ko?'KICKOFF_PASSED':
   now>=final?'FINAL_30M_WINDOW':now>=open?'DAY_AHEAD_WINDOW':'AWAITING_30H_WINDOW';
  entries.push({gameId,kickoff:iso(ko),shard:shardForGame(gameId),
   collectorState,windowOpensAt:iso(open),
   earliestEligibleCronTick:iso(tick(open)),
   finalWindowOpensAt:iso(final),earliestFinalCronTick:iso(tick(final)),
   checkpointStageNow:nflPricingCheckpointStage(g,{now})});
 }
 entries.sort((a,b)=>a.kickoff.localeCompare(b.kickoff)||a.gameId.localeCompare(b.gameId));
 const due=nflCollectorDueGames(games,{now});
 const dueIds=new Set(due.map(g=>String(g.gameId)));
 const plannedByShard=Array.from({length:COLLECTOR_SHARDS},(_,shard)=>({
  shard,scheduled:entries.filter(g=>g.shard===shard).length,
  due:entries.filter(g=>g.shard===shard&&dueIds.has(g.gameId)).length
 }));
 const byDay={};
 for(const x of entries){
  if(x.collectorState==='KICKOFF_PASSED')continue;
  for(const [name,time] of [['dayAhead',x.earliestEligibleCronTick],
    ['final',x.earliestFinalCronTick]]){
   if(Date.parse(time)<now)continue;
   const day=time.slice(0,10);
   byDay[day]??={dayAhead:0,final:0,total:0};
   byDay[day][name]++;byDay[day].total++;
  }
 }
 const utcBudgetForecast=Object.entries(byDay).sort(([a],[b])=>a.localeCompare(b))
  .map(([utcDate,totals])=>({utcDate,...totals,
   capacityPerUtcDay:NFL_CHECKPOINT_DAILY_SLOTS,
   exceedsSharedCapacity:totals.total>NFL_CHECKPOINT_DAILY_SLOTS}));
 return{scope:'SCHEDULED_GAMES_ONLY',lookaheadHours:30,
  cronIntervalMinutes:15,shards:plannedByShard,scheduledGames:entries.length,
  dueNow:entries.filter(x=>dueIds.has(x.gameId)).length,
  waiting:entries.filter(x=>x.collectorState==='AWAITING_30H_WINDOW').length,
  finalWindow:entries.filter(x=>x.collectorState==='FINAL_30M_WINDOW').length,
  games:entries,utcBudgetForecast,
  note:'Forecast only. Cron execution, paid-provider quota, current injury clearance, three SGP tiers and verified combined sportsbook quotes require independent live evidence. A scheduled 15-minute tick is not a guarantee of completion at that minute.'};
}
