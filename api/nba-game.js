import {parseNbaGame,nbaNotReadyTiers} from '../lib/nba-data-model.js';
import {nbaVerifiedScheduledFallback,nbaEasternGameDay} from '../lib/nba-scheduled-fallback.js';
import {nbaReadPregame,nbaPregameStatus} from './nba-health.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const gameId=String(req.query?.gameId||'');
 if(!/^\d{7,12}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_nba_game_id'});
 try{
  let data=null;
  try{
   const response=await fetch(ESPN+'?event='+encodeURIComponent(gameId),
    {cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('espn_nba_summary_'+response.status);
   const parsed=parseNbaGame(await response.json(),gameId);
   // An explicit mismatched game identity is a hard stop, NOT an invitation
   // to fall back to another schedule and accidentally attach wrong picks.
   if(!parsed.ok)return res.status(409).json(parsed);
   data=parsed;
  }catch(e){
   console.warn('nba_game_summary_pending',{gameId,reason:String(e?.message||e).slice(0,70)});
  }
  const snapshot=await nbaReadPregame(gameId);
  if(!data){
   // Detailed future game summaries can be missing or transient; a stored
   // pregame snapshot still needs a fresh ESPN SCOREBOARD identity check.
   // Without BOTH sources fail closed, never render an invented game.
   const day=snapshot&&nbaEasternGameDay(snapshot.kickoff);
   if(!day)return res.status(503).json({ok:false,error:'nba_game_summary_unavailable',
    note:'No verified NBA game summary or matching stored pregame snapshot.'});
   let schedule;
   try{
    const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+day+'&limit=100',
     {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('nba_scoreboard_'+response.status);
    schedule=await response.json();
   }catch{
    return res.status(503).json({ok:false,error:'nba_schedule_fallback_unavailable',
     note:'Neither ESPN game summary nor verified scoreboard is accessible; no stored picks will be shown.'});
   }
   data=nbaVerifiedScheduledFallback(schedule,gameId,snapshot);
   if(!data)return res.status(503).json({ok:false,error:'nba_game_fallback_identity_unverified',
    note:'Stored SGP could not be cross-checked against the current ESPN matchup and tipoff.'});
  }
  if(snapshot){
   data.pregameReadiness=nbaPregameStatus(snapshot,{gameStatus:data.status});
   data.pregameCheckedAt=snapshot.checkedAt;
   res.setHeader('X-Momentum-NBA-Snapshot-Version',String(snapshot.checkedAt));
   data.injuryRecheckedAt=snapshot.injuryCheckedAt;
   data.sgpModelVersion=snapshot.modelVersion||'legacy-unversioned';
   const current=data.pregameReadiness.freshness==='CURRENT';
   // Public read-only positional context: never present historical allowances
   // as verified betting markets, defender assignments, or current picks.
   data.nbaPositionContext=current&&snapshot.nbaPositionEvidence?
    {status:snapshot.nbaPositionEvidence.status,
     asOf:snapshot.nbaPositionEvidence.asOf,
     source:snapshot.nbaPositionEvidence.source,
     limitation:snapshot.nbaPositionEvidence.limitation,
     teams:snapshot.nbaPositionEvidence.teams}:null;
   if(data.pregameSourceMode==='SCOREBOARD_VERIFIED_FALLBACK'&&current&&
     snapshot.injuryReportStatus==='ESPN_REPORTED_INJURIES_RECHECKED'&&
     Array.isArray(snapshot.verifiedInjuries)){
    data.injuries=snapshot.verifiedInjuries;
    data.injuryEvidenceStatus='ESPN_REPORTED_SNAPSHOT_NOT_OFFICIAL_INACTIVES';
   }
   // Only expose candidate legs if the stage-specific model and injury
   // freshness are still valid. Old (even AI-reviewed) legs must not linger.
   if(data.status==='SCHEDULED')data.sgps=current?snapshot.sgps:
    nbaNotReadyTiers(data.pregameReadiness.reason);
   else data.pregameHistoricalSgps=snapshot.sgps;
  }else data.pregameReadiness=nbaPregameStatus(null);
  return res.status(200).json(data);
 }catch(e){
  console.warn('nba_game_summary_unavailable',{gameId,reason:String(e?.message||e).slice(0,100)});
  return res.status(503).json({ok:false,error:'nba_game_summary_unavailable',
   note:'Game/player evidence could not be verified; do not treat missing evidence as a confirmed healthy lineup.'});
 }
}
