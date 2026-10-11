import {nflSgpReadinessFromBlob} from '../lib/nfl-sgp-snapshot-status.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 // No arbitrary Blob crawler: game ID exact numeric, date close to now.
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{7,12}$/.test(gameId)||
   !Number.isFinite(Date.parse(date+'T12:00:00Z')))
  return res.status(400).json({ok:false,error:'invalid_date_or_game_id'});
 const day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000),
  today=Math.floor(Date.now()/86400000);
 if(day<today-2||day>today+30)
  return res.status(400).json({ok:false,error:'date_outside_monitoring_window'});
 const data=await nflSgpReadinessFromBlob({date,gameId});
 return res.status(data.httpStatus).json(data.result);
}
