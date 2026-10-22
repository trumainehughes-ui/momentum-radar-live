import {list} from '@vercel/blob';
import {estimateNflHitChance} from '../lib/nfl-model-hit-chance.js';
import {buildNflSlateRankings,nflSlateSnapshotPrefix,nflSlateSnapshotPathValid,nflSlateSnapshotGameId}
 from '../lib/nfl-slate-rankings.js';

const cats=['td','passing','rushing','receiving','receptions'];
const clean=(x,n=80)=>String(x??'').trim().slice(0,n);
function publicRow(x,cat){
 const base={name:clean(x.name),team:clean(x.team,4),opponent:clean(x.opponent,4),
  gameId:clean(x.gameId,12),rank:Number(x.rank)||null,category:cat};
 if(cat==='td'){
  if(x?.tdModelStatus!=='ESPN_MATCHUP_MODEL'||
     !Number.isFinite(Number(x?.modelTdPercent)))return null;
  return{...base,modelChancePct:Math.round(Number(x.modelTdPercent)),
   hitProbabilityPct:estimateNflHitChance(x,cat)?.percent??null};
 }
 const n=Number(x?.projection);
 if(!Number.isFinite(n)||n<=0)return null;
 const hit=estimateNflHitChance(x,cat);
 return{...base,projection:cat==='receptions'?Math.round(n*10)/10:
  Math.round(n/5)*5,hitProbabilityPct:hit?.percent??null,hitTarget:hit?.target??null};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=90, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))
  return res.status(400).json({ok:false,error:'invalid_date'});
 const day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000),today=Math.floor(Date.now()/86400000);
 if(day<today-2||day>today+30)return res.status(400).json({ok:false,error:'date_outside_public_window'});
 try{
  const prefix=nflSlateSnapshotPrefix(date),found=await list({prefix,limit:1000});
  const latest=new Map();for(const blob of (found.blobs||[]).filter(x=>nflSlateSnapshotPathValid(x.pathname,date)).sort((a,b)=>Date.parse(b.uploadedAt||0)-Date.parse(a.uploadedAt||0))){const id=nflSlateSnapshotGameId(blob.pathname,date);if(id&&!latest.has(id))latest.set(id,blob)}const files=[...latest.values()].slice(0,32);
  const snapshots=[];
  for(let i=0;i<files.length;i+=6){
   const batch=await Promise.allSettled(files.slice(i,i+6).map(async blob=>{
    const r=await fetch(blob.url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!r.ok)return null;
    const s=await r.json();
    const id=nflSlateSnapshotGameId(blob.pathname,date);
    return String(s?.body?.gameId||'')===id?s:null;
   }));
   snapshots.push(...batch.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value));
  }
  const ranked=buildNflSlateRankings(snapshots,{date});
  const categories=Object.fromEntries(cats.map(cat=>[cat,
   (ranked.categories?.[cat]||[]).map(x=>publicRow(x,cat)).filter(Boolean)]));
  return res.status(200).json({ok:true,date,categories,
   categoryGameCounts:ranked.categoryGameCounts||{},
   gamesWithProjections:ranked.gamesWithProjections||0,
   verifiedTdOffers:ranked.verifiedTdOffers||0,
   rankingScope:'SAVED_GAME_SNAPSHOTS_ONLY',
   updatedAt:ranked.newestSnapshotAt||null,modelOnly:true});
 }catch{
  res.setHeader('Cache-Control','private, no-store');
  return res.status(503).json({ok:false,error:'rankings_temporarily_unavailable'});
 }
}
