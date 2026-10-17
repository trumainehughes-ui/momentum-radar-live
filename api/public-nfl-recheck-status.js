// Public-facing progress for scheduled NFL rechecks. This route is read-only
// and cannot mint a change token, call an AI provider, or refresh odds.
import {readCollectorAudits} from '../lib/pregame-collector-shards.js';
import {publicNflRefreshState} from '../lib/nfl-public-refresh-state.js';

const PUBLIC_SCHEDULE='https://momentum-radar-live.vercel.app/api/nfl-schedule';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public,s-maxage=120,stale-while-revalidate=60');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 const at=Date.parse(date+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(at)||
  new Date(at).toISOString().slice(0,10)!==date||!/^\d{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'invalid_game_scope'});
 if(at<Date.now()-86400000||at>Date.now()+7*86400000)
  return res.status(400).json({ok:false,error:'outside_active_schedule'});
 try{
  const [schedule,audits]=await Promise.all([
   fetch(PUBLIC_SCHEDULE+'?date='+encodeURIComponent(date),{
    cache:'no-store',signal:AbortSignal.timeout(9500)})
   .then(r=>{if(!r.ok)throw Error('schedule_unavailable');return r.json();}),
   readCollectorAudits('nfl').catch(()=>null)
  ]);
  const game=schedule?.games?.find(x=>String(x.gameId)===gameId);
  if(schedule?.ok!==true||schedule.date!==date||!game)
   return res.status(404).json({ok:false,error:'game_not_on_schedule'});
  const status=publicNflRefreshState(game,audits,{now:Date.now()});
  if(!status)return res.status(503).json({ok:false,error:'refresh_schedule_unavailable'});
  return res.status(200).json({...status,date,checkedAt:new Date().toISOString()});
 }catch{
  res.setHeader('Cache-Control','private,no-store');
  return res.status(503).json({ok:false,error:'recheck_status_temporarily_unavailable'});
 }
}
