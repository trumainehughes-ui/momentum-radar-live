// Read-only, deterministic public view of the *existing signed* NFL refresh.
// This endpoint cannot schedule, initiate, or authorize sportsbook/AI spending.
import {nflCollectionForecast} from './nfl-slate-collection-forecast.js';
import {shardForGame} from './pregame-collector-shards.js';

const TICK=15*60*1000;
const nextTick=now=>new Date(Math.ceil((now+1000)/TICK)*TICK).toISOString();
const safeStatus=new Set(['updated','locked','no_qualified_model_data',
 'markets_unavailable','collector_error']);
const safeBook=new Set(['NOT_DUE','NOT_CONFIGURED','UNTRUSTED_ORIGIN',
 'ALREADY_ATTEMPTED_OR_STORE_UNAVAILABLE','DAILY_CHECKPOINT_BUDGET_EXHAUSTED',
 'TOKEN_UNAVAILABLE','TOKEN_STORE_UNAVAILABLE','MARKET_REFRESH_UNAVAILABLE',
 'MARKET_RESPONSE_UNVERIFIED','MARKET_REFRESHED','SKIPPED_VERIFIED_INJURY_REFRESH']);
const safeAi=new Set(['REVIEWED','PENDING','SKIPPED','UNAVAILABLE']);
const safeInjury=new Set(['compared','baseline_created','insufficient_injury_evidence',
 'DETECTOR_UNAVAILABLE','DETECTOR_RESPONSE_INVALID','NOT_CONFIGURED','UNTRUSTED_ORIGIN']);

export function publicNflRefreshState(game,audits,{now=Date.now()}={}){
 const id=String(game?.gameId||''),preview=nflCollectionForecast([game],{now}).games[0];
 if(!preview||!Number.isFinite(now))return null;
 const kickoff=Date.parse(preview.kickoff);
 const shard=shardForGame(id);
 const report=audits?.shards?.find(a=>a.shard===shard&&a.status==='COMPLETE');
 const found=report?.results?.find(row=>String(row.gameId)===id);
 const last=found&&Number.isFinite(Date.parse(report.checkedAt||''))?
  {checkedAt:report.checkedAt,
   collectorStatus:safeStatus.has(found.status)?found.status:'OTHER',
   bookCheckpoint:safeBook.has(found.bookCheckpoint?.status)?
    found.bookCheckpoint.status:'NOT_CONFIRMED',
   aiReview:safeAi.has(found.aiReviewStatus)?found.aiReviewStatus:'UNKNOWN',
   injuryCheck:safeInjury.has(found.injuryWatch?.status)?
    found.injuryWatch.status:'UNKNOWN',
   modelTierCoverage:found.coverage||'UNVERIFIED'}:null;
 const waiting=now<Date.parse(preview.windowOpensAt);
 const phase=now>=kickoff?'GAME_STARTED':
  waiting?'WAITING_DAY_AHEAD_WINDOW':
  preview.collectorState==='FINAL_30M_WINDOW'?'FINAL_RECHECK_WINDOW':
   'SCHEDULED_RECHECK_WINDOW';
 return {ok:true,gameId:id,phase,
  nextEligibleAt:waiting?preview.earliestEligibleCronTick:null,
  nextScheduledTick:phase==='GAME_STARTED'?null:
   waiting?preview.earliestEligibleCronTick:nextTick(now),
  finalCheckAt:preview.earliestFinalCronTick,
  cadenceMinutes:15,
  lastAttempt:last,
  scope:'AUTOMATIC_SIGNED_COLLECTOR_ONLY',
  note:'The public view reads progress only. A scheduled cycle does not guarantee AI completion, native sportsbook lines or combined SGP quotes.'};
}
