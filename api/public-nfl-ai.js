import {list} from '@vercel/blob';
import {nflSgpSnapshotPath} from '../lib/nfl-sgp-snapshot-status.js';
import {nflAiReviewMarketAgreement} from '../lib/nfl-ai-review-integrity.js';

// This endpoint serves saved, already-generated AI reports. Public viewers can
// choose analysis topics but cannot trigger inference, alter picks or consume
// provider credits. Internal evidence digests and private prompts stay hidden.
const safeText=(v,max=1500)=>String(v??'').replace(new RegExp('https?:[^ ]+','gi'),'')
 .replace(/[<>]/g,'').slice(0,max).trim();
const dateEt=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',
 year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
export function publicAiSummary(snap,{date,gameId,now=Date.now(),currentMarket=null,requireMarketAgreement=false}={}){
 if(snap?.league!=='nfl'||String(snap.gameId)!==String(gameId)||
  String(snap?.game?.gameId||'')!==String(gameId)||
  !Number.isFinite(Date.parse(snap?.game?.kickoff))||
  dateEt(snap.game.kickoff)!==date||
  snap.injuryChecks?.rosterAndInjuryEligibilityChecked!==true)
  return{ok:true,status:'REVIEW_PENDING',message:'A screened AI game review is not available yet.'};
 const r=snap.aiReview||{},at=Date.parse(r.checkedAt||snap.checkedAt||'');
 if(r.status!=='REVIEWED'||!r.advisoryOnly||r.canAlterPicks!==false||
  !safeText(r.summary)||!Number.isFinite(at)||at>now+60_000)
  return{ok:true,status:'REVIEW_PENDING',message:'The game-day AI review is still waiting for eligible, current model evidence.'};
 if(requireMarketAgreement){
  const gate=nflAiReviewMarketAgreement(snap,currentMarket,{date,gameId,now});
  if(!gate.ok)return{ok:true,status:'REVIEW_PENDING',
   reason:gate.status,
   message:gate.status==='AI_REVIEW_NEEDS_REVALIDATION'?
    'Injury status or SGP legs changed after the saved AI review. The old narrative has been withheld until a verified new review is generated.':
    'Waiting for a fresh, verified game prediction snapshot before showing the AI narrative.'};
 }
 const stale=now-at>36*3600_000;
 return{ok:true,status:stale?'HISTORICAL_AI_REVIEW':'SAVED_AI_REVIEW',
  generatedAt:new Date(at).toISOString(),
  advisoryOnly:true,changesSelections:false,modelOnly:true,
  analysis:safeText(r.summary),
  note:stale?'This report is historical, not a current game-day update.':
   'Read-only AI analysis based on previously screened matchup and player evidence.'};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=60, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const gameId=String(req.query?.gameId||''),date=String(req.query?.date||'');
 if(!/^\d{7,12}$/.test(gameId)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
  !Number.isFinite(Date.parse(date+'T12:00:00Z')))
  return res.status(400).json({ok:false,error:'invalid_date_or_game'});
 const day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000),
  today=Math.floor(Date.now()/86400000);
 if(day<today-2||day>today+30)
  return res.status(400).json({ok:false,error:'date_outside_window'});
 try{
  const path='momentum-history/v1/nfl-'+gameId+'.json',
   marketPath=nflSgpSnapshotPath(date,gameId);
  if(!marketPath)throw Error('invalid_market_snapshot_path');
  const [historyBlobs,marketBlobs]=await Promise.all([
   list({prefix:path,limit:4}),list({prefix:marketPath,limit:4})
  ]);
  const item=(historyBlobs.blobs||[]).find(x=>x.pathname===path),
   current=(marketBlobs.blobs||[]).find(x=>x.pathname===marketPath);
  if(!item)return res.status(200).json({ok:true,status:'REVIEW_PENDING',
   message:'No saved AI game analysis has been generated yet.'});
  if(!current)return res.status(200).json({ok:true,status:'REVIEW_PENDING',
   reason:'MODEL_REFRESH_PENDING',
   message:'Waiting for a current game model before showing the AI review.'});
  const [historyResponse,marketResponse]=await Promise.all([
   fetch(item.url,{cache:'no-store',signal:AbortSignal.timeout(6000)}),
   fetch(current.url,{cache:'no-store',signal:AbortSignal.timeout(6000)})
  ]);
  if(!historyResponse.ok||!marketResponse.ok)throw Error('saved_snapshot_unreadable');
  const [history,market]=await Promise.all([historyResponse.json(),marketResponse.json()]);
  return res.status(200).json(publicAiSummary(history,{date,gameId,
   currentMarket:market,requireMarketAgreement:true}));
 }catch{
  res.setHeader('Cache-Control','private, no-store');
  return res.status(503).json({ok:false,error:'saved_ai_report_temporarily_unavailable'});
 }
}
