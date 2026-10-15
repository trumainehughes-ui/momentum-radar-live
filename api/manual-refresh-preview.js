// Read-only preview of the latest stored game analysis. Never contacts paid sports APIs.
// This is not a replacement for a fresh injury report or live sportsbook quote.
import {list} from '@vercel/blob';
const prefix={NFL:'momentum-history/v1/nfl-',NBA:'momentum-pregame/v1/nba-'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const sport=String(req.query?.sport||'').toUpperCase(),gameId=String(req.query?.gameId||'');
 if(!prefix[sport]||!/^\d{7,12}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_game'});
 try{
  const path=prefix[sport]+gameId+'.json';
  const items=await list({prefix:path,limit:3});
  const found=items.blobs?.find(b=>b.pathname===path);
  if(!found)return res.status(404).json({ok:false,error:'cached_snapshot_missing',paidSportsApiCalls:0});
  const response=await fetch(found.url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error('snapshot_read_failed');
  const snap=await response.json();
  if(String(snap.gameId||gameId)!==gameId)return res.status(409).json({ok:false,error:'snapshot_identity_mismatch'});
  return res.status(200).json({ok:true,sport,gameId,paidSportsApiCalls:0,
   status:'cached_review_only',updatedAt:snap.checkedAt||snap.updatedAt||snap.fetchedAt||null,
   modelVersion:snap.modelVersion||null,
   tiers:Array.isArray(snap.sgps)?snap.sgps.map(s=>({risk:s.risk,status:s.status,legCount:s.legs?.length||0})):[],
   message:'Cached snapshot reviewed. No paid sports-data API called. No AI inference, live injury refresh, sportsbook repricing or SGP publication performed.'});
 }catch(e){return res.status(503).json({ok:false,error:'cached_review_unavailable',paidSportsApiCalls:0})}
}
