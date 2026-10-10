import {parseNbaGame} from '../lib/nba-data-model.js';
import {nbaReadPregame,nbaPregameStatus} from './nba-health.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=45, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const gameId=String(req.query?.gameId||'');
 if(!/^\d{7,12}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_nba_game_id'});
 try{
  const response=await fetch(ESPN+'?event='+encodeURIComponent(gameId),
   {cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('espn_nba_summary_'+response.status);
  const data=parseNbaGame(await response.json(),gameId);
  if(!data.ok)return res.status(409).json(data);
  const snapshot=await nbaReadPregame(gameId);
  if(snapshot){
   data.pregameReadiness=nbaPregameStatus(snapshot);
   data.pregameCheckedAt=snapshot.checkedAt;
   data.injuryRecheckedAt=snapshot.injuryCheckedAt;
   data.sgpModelVersion=snapshot.modelVersion||'legacy-unversioned';
   // Matchups on the day-before slate display supported model-only legs.
   // Once live, preserve pregame snapshot as historical reference, not a live
   // available sportsbook SGP.
   if(data.status==='SCHEDULED')data.sgps=snapshot.sgps;
   else data.pregameHistoricalSgps=snapshot.sgps;
  }else data.pregameReadiness=nbaPregameStatus(null);
  return res.status(200).json(data);
 }catch(e){
  console.warn('nba_game_summary_unavailable',{gameId,reason:String(e?.message||e).slice(0,100)});
  return res.status(503).json({ok:false,error:'nba_game_summary_unavailable',
   note:'Game/player evidence could not be verified; do not treat missing evidence as a confirmed healthy lineup.'});
 }
}
