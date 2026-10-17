// Public research-only kickoff weather. Only verified scheduled NFL events.
// No bookmaker, AI, model adjustment or admin endpoint is invoked.
import {fetchPublicKickoffWeather} from '../lib/nfl-public-kickoff-weather.js';
const BASE='https://momentum-radar-live.vercel.app';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public,s-maxage=900,stale-while-revalidate=300');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 const at=Date.parse(date+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(at)||
  new Date(at).toISOString().slice(0,10)!==date||!/^\d{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'invalid_date_or_game'});
 if(at<Date.now()-86400000||at>Date.now()+16*86400000)
  return res.status(400).json({ok:false,error:'outside_weather_window'});
 try{
  const r=await fetch(BASE+'/api/nfl-schedule?date='+encodeURIComponent(date),
   {cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('schedule_response_not_available');
  const slate=await r.json();
  if(slate?.ok!==true||slate.date!==date)throw Error('schedule_not_validated');
  const game=slate.games?.find(g=>String(g?.gameId)===gameId);
  if(!game)return res.status(404).json({ok:false,error:'scheduled_game_not_found'});
  const forecast=await fetchPublicKickoffWeather(game);
  return res.status(200).json({ok:true,gameId,date,
   checkedAt:new Date().toISOString(),...forecast});
 }catch{
  res.setHeader('Cache-Control','private,no-store');
  return res.status(503).json({ok:false,error:'weather_source_unavailable'});
 }
}