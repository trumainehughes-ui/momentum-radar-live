import {list} from '@vercel/blob';
import {buildNflSlateRankings,nflSlateSnapshotPrefix,nflSlateSnapshotPathValid,nflSlateSnapshotGameId}
 from '../lib/nfl-slate-rankings.js';

// Top 10 lists are read-only: use the market snapshots that the scheduled
// collector/game pages already verified instead of hitting paid sports APIs
// 13 times whenever a visitor changes a ranking tab.
async function savedGameSnapshots(date){
 const prefix=nflSlateSnapshotPrefix(date);
 const blobs=[];let cursor=null;
 // Immutable collector snapshots can exceed 100 per slate; page boundedly
 // and keep only the newest valid snapshot for each actual ESPN game.
 for(let page=0;page<3;page++){
  const found=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
  blobs.push(...(found.blobs||[]));
  cursor=found.cursor||null;if(!cursor)break;
 }
 const candidates=blobs.filter(b=>nflSlateSnapshotPathValid(b.pathname,date))
  .sort((a,b)=>Date.parse(b.uploadedAt||0)-Date.parse(a.uploadedAt||0));
 const newest=new Map();
 for(const b of candidates){const id=nflSlateSnapshotGameId(b.pathname,date);
  if(id&&!newest.has(id))newest.set(id,b)}
 const matches=[...newest.values()].slice(0,32);
 const snapshots=[];
 for(let i=0;i<matches.length;i+=6){
  const chunk=await Promise.allSettled(matches.slice(i,i+6).map(async b=>{
   const r=await fetch(b.url,{cache:'no-store',
    signal:AbortSignal.timeout(4500)});
   if(!r.ok)return null;
   const snap=await r.json();
   const pathGameId=nflSlateSnapshotGameId(b.pathname,date);
   if(String(snap?.body?.gameId||'')!==pathGameId)return null;
   return snap;
  }));
  snapshots.push(...chunk.filter(x=>x.status==='fulfilled'&&x.value)
   .map(x=>x.value));
 }
 return snapshots;
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    Number.isNaN(Date.parse(date+'T12:00:00Z')))
  return res.status(400).json({ok:false,error:'date_required'});
 try{
  const snapshots=await savedGameSnapshots(date);
  const summary=buildNflSlateRankings(snapshots,{date});
  res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=180');
  return res.status(200).json({ok:true,date,...summary,
   savedGamesScanned:snapshots.length,fetchedAt:new Date().toISOString()});
 }catch{
  res.setHeader('Cache-Control','private, no-store');
  return res.status(503).json({ok:false,error:'saved_nfl_rankings_temporarily_unavailable'});
 }
}
