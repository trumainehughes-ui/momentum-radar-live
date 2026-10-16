// Read-only coverage and freshness audit; model research is NOT sportsbook verification.
import {nflEasternDate} from './nfl-collector-readiness.js';
const ID=/^\d{7,12}$/;
const THIRTY_HOURS=30*3600_000;
const FRESH_AFTER_DUE=30*60_000;
const toMs=x=>Date.parse(String(x||''));

export function nflSundayTdReadiness({date,games,rankings,now=Date.now()}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||
    !Number.isFinite(Date.parse(date+'T12:00:00Z'))||
    !Number.isFinite(now))throw Error('invalid_readiness_scope');
 const seen=new Set(),scheduled=[];
 for(const g of Array.isArray(games)?games:[]){
  const gameId=String(g?.gameId||''),kickoffMs=toMs(g?.kickoff);
  if(!ID.test(gameId)||seen.has(gameId)||g?.status!=='SCHEDULED'||
     !Number.isFinite(kickoffMs)||
     nflEasternDate(new Date(kickoffMs))!==date)continue;
  seen.add(gameId);
  scheduled.push({gameId,kickoffMs,home:g.home?.abbr||null,
   away:g.away?.abbr||null});
 }
 scheduled.sort((a,b)=>a.kickoffMs-b.kickoffMs||a.gameId.localeCompare(b.gameId));
 const byId=new Map();
 for(const x of rankings?.tdGameSnapshots||[]){
  const id=String(x?.gameId||''),at=toMs(x?.at);
  if(ID.test(id)&&Number.isFinite(at)&&at<=now+60_000&&at>0)
   byId.set(id,Math.max(byId.get(id)||0,at));
 }
 const details=scheduled.map(g=>{
  const modelAt=byId.get(g.gameId)||null,windowOpen=now>=g.kickoffMs-THIRTY_HOURS,
   beforeKickoff=now<g.kickoffMs;
  const modelAgeMinutes=modelAt===null?null:Math.max(0,Math.floor((now-modelAt)/60000));
  const missing=!modelAt;
  // Once a game is due, a 15-minute cron may need one more run; allow 30
  // minutes before marking its saved scoring model stale.
  const stale=!missing&&windowOpen&&beforeKickoff&&now-modelAt>FRESH_AFTER_DUE;
  const phase=!beforeKickoff?'KICKOFF_PASSED':windowOpen?'PREGAME_WINDOW':'EARLY_PREVIEW';
  return{gameId:g.gameId,home:g.home,away:g.away,
   kickoff:new Date(g.kickoffMs).toISOString(),
   phase,status:missing?'MISSING_MODEL':stale?'STALE_MODEL':'MODEL_PRESENT',
   modelSnapshotAt:modelAt?new Date(modelAt).toISOString():null,
   modelAgeMinutes};
 });
 const missing=details.filter(g=>g.status==='MISSING_MODEL'),
  stale=details.filter(g=>g.status==='STALE_MODEL');
 const topTen=Array.isArray(rankings?.categories?.td)?
  Math.min(10,rankings.categories.td.length):0;
 return{date,scheduledGames:details.length,
  modelGames:details.length-missing.length,missingGames:missing.length,
  stalePregameGames:stale.length,topScorers:topTen,
  status:!details.length?'NO_SCHEDULED_SUNDAY_GAMES':
   missing.length?'INCOMPLETE_SUNDAY_MODELS':
   stale.length?'PREGAME_MODEL_REFRESH_OVERDUE':
   topTen<10?'FEWER_THAN_TEN_QUALIFIED_SCORERS':'FULL_SUNDAY_MODEL_COVERAGE',
  missingGameIds:missing.map(x=>x.gameId),
  staleGameIds:stale.map(x=>x.gameId),games:details,
  sportsbookTdOffersVerified:Number(rankings?.verifiedTdOffers)||0,
  note:'This is a check of saved ESPN scoring candidates, not confirmation of active starters or DraftKings/FanDuel Anytime TD odds. A model snapshot more than 30 minutes old after its pregame collector window opens is marked stale.'};
}
