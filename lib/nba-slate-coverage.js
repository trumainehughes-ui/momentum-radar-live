// Read-only NBA slate status. A model candidate is NOT a book-quoted SGP.
// No sportsbook, AI, BOX SCORE or paid data endpoints are called here.
import {nbaPregameStatus,nbaReadPregame} from '../api/nba-health.js';
import {nflRunCollectorBatch} from './nfl-collector-readiness.js';
export const NBA_COVERAGE_MAX_GAMES=18;
export const NBA_COVERAGE_LOOKAHEAD=36*60*60*1000;
export function nbaCoverageIdentity(game,snapshot){
 if(!game||!snapshot||String(game.gameId)!==String(snapshot.gameId))return false;
 const current=Date.parse(game.kickoff),stored=Date.parse(snapshot.kickoff);
 if(!Number.isFinite(current)||!Number.isFinite(stored)||Math.abs(current-stored)>60_000)return false;
 if(snapshot.home?.abbr&&snapshot.home.abbr!==game.home?.abbr)return false;
 if(snapshot.away?.abbr&&snapshot.away.abbr!==game.away?.abbr)return false;
 return true;
}
export function nbaCoverageResult(game,snapshot,{now=Date.now()}={}){
 const id=String(game.gameId||''),start=Date.parse(game.kickoff),remaining=start-now;
 const base={gameId:id,away:game.away?.abbr||null,home:game.home?.abbr||null,
  kickoff:game.kickoff,checkedAt:null,injuryReportStatus:'UNVERIFIED',
  aiReviewStatus:'PENDING',tierCount:0,tiers:[],sportsbookOddsVerified:false};
 if(game.status!=='SCHEDULED')return {...base,status:'CLOSED',
  reason:'No active pregame model after game starts or is finalized.'};
 if(!Number.isFinite(remaining)||remaining<=0)return{...base,status:'AWAITING_GAME_STATUS',
  reason:'Scheduled tipoff has passed; scoreboard status must be updated before treating picks as pregame.'};
 if(remaining>NBA_COVERAGE_LOOKAHEAD)return{...base,status:'WINDOW_NOT_STARTED',
  reason:'Scheduled model collection begins within 36 hours of tipoff.'};
 if(!snapshot)return{...base,status:'PENDING',reason:'Awaiting first saved pregame model/injury check.'};
 if(!nbaCoverageIdentity(game,snapshot))return{...base,status:'IDENTITY_MISMATCH',
  reason:'Stored snapshot game/team/tipoff does not match the live ESPN scoreboard.'};
 const s=nbaPregameStatus(snapshot,{now,gameStatus:game.status});
 const tiers=Array.isArray(s.tiers)?s.tiers:[];
 return{...base,status:s.status,reason:String(s.reason||'').slice(0,250),
  modelStage:s.stage||null,checkedAt:s.checkedAt||null,
  injuryCheckedAt:s.injuryCheckedAt||null,
  injuryReportStatus:s.injuryReportStatus||'UNVERIFIED',
  aiReviewStatus:s.aiReviewStatus||'PENDING',
  sampleSource:s.sampleSource||'UNAVAILABLE',historicalSeason:s.historicalSeason||null,
  tierCount:tiers.length,tiers:tiers.slice(0,3),
  // With these free sources no combined DraftKings/FanDuel quote is verified.
  sportsbookOddsVerified:false};
}
export async function nbaBuildCoverage(games,{now=Date.now(),read=nbaReadPregame}={}){
 const list=(Array.isArray(games)?games:[]).slice(0,NBA_COVERAGE_MAX_GAMES);
 const results=await nflRunCollectorBatch(list,async g=>{
  const stage=Date.parse(g.kickoff)-now;
  if(g.status!=='SCHEDULED'||!Number.isFinite(stage)||stage<=0||
    stage>NBA_COVERAGE_LOOKAHEAD)return nbaCoverageResult(g,null,{now});
  try{
   const snapshot=await read(g.gameId,{strict:true});
   return nbaCoverageResult(g,snapshot,{now});
  }catch{return {...nbaCoverageResult(g,null,{now}),status:'SNAPSHOT_UNAVAILABLE',
   reason:'Persistent pregame storage could not be read; no picks verified.'}}
 },{concurrency:3});
 const count=k=>results.filter(x=>x.status===k).length;
 return{games:results,summary:{checked:results.length,
  modelCandidates:count('MODEL_ONLY'),notReady:count('NOT_READY'),
  stale:count('STALE'),pending:count('PENDING'),outsideWindow:count('WINDOW_NOT_STARTED'),
  sourceErrors:count('SNAPSHOT_UNAVAILABLE')+count('IDENTITY_MISMATCH'),
  currentBookQuoted:0}};
}
