import {list} from '@vercel/blob';
import {nflSgpSnapshotPath} from '../lib/nfl-sgp-snapshot-status.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';

// Fan-facing saved prediction data ONLY. No paid odds, ESPN, AI, admin APIs,
// market regeneration, mutations, or live sportsbook verification.
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=45, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 const path=nflSgpSnapshotPath(date,gameId);
 if(!path)return res.status(400).json({ok:false,error:'invalid_game_or_date'});
 const today=Math.floor(Date.now()/86400000);
 const day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000);
 if(day<today-2||day>today+30)
  return res.status(400).json({ok:false,error:'date_outside_public_window'});
 try{
  const records=await list({prefix:path,limit:5});
  const file=(records.blobs||[]).find(x=>x.pathname===path);
  if(!file)return res.status(200).json({ok:true,date,gameId,status:'PENDING',
   message:'Matchup analysis is waiting for its first saved update.',
   categories:{td:[],passing:[],rushing:[],receiving:[],receptions:[]},
   parlays:[],verifiedQuotes:[]});
  const response=await fetch(file.url,{cache:'no-store',
   signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error('snapshot_read_unavailable');
  const snap=await response.json();
  const safe=publicNflGameView(snap,{date,gameId});
  if(!safe.ok)return res.status(200).json({ok:true,date,gameId,status:'REVIEW',
    message:'Game predictions could not be validated.',
    categories:{td:[],passing:[],rushing:[],receiving:[],receptions:[]},
    parlays:[],verifiedQuotes:[]});
  return res.status(200).json(safe);
 }catch{
  res.setHeader('Cache-Control','private, no-store');
  return res.status(503).json({ok:false,error:'public_predictions_temporarily_unavailable'});
 }
}
