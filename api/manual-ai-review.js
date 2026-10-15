// Admin-only, read-only manual AI review. No sportsbook API calls or snapshot writes.
import {list} from '@vercel/blob';
import {timingSafeEqual} from 'node:crypto';
import {runManualEvidenceAiReview} from '../lib/manual-ai-review-runner.js';
import {createManualAiAdapter} from '../lib/manual-ai-provider-adapter.js';
const PREFIX={NFL:'momentum-history/v1/nfl-',NBA:'momentum-pregame/v1/nba-'};
export function authorizedManualReview(req,secret){
 if(!secret)return false;
 const actual=Buffer.from(String(req.headers?.authorization||''));
 const expected=Buffer.from('Bearer '+secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!authorizedManualReview(req,process.env.CRON_SECRET))
  return res.status(401).json({ok:false,error:'unauthorized'});
 const sport=String(req.body?.sport||'').toUpperCase(),gameId=String(req.body?.gameId||'');
 if(!PREFIX[sport]||!/^\d{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'invalid_game'});
 try{
  const path=PREFIX[sport]+gameId+'.json';
  const rows=await list({prefix:path,limit:3});
  const hit=rows.blobs?.find(x=>x.pathname===path);
  if(!hit)return res.status(404).json({ok:false,error:'snapshot_missing'});
  const source=await fetch(hit.url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(!source.ok)throw Error('snapshot_read_failed');
  const snapshot=await source.json();
  if(String(snapshot.gameId)!==gameId)return res.status(409).json({ok:false,error:'snapshot_identity_mismatch'});
  const game=sport==='NBA'&&snapshot.home?.abbr&&snapshot.away?.abbr?
   {gameId,home:snapshot.home,away:snapshot.away,kickoff:snapshot.kickoff}:
   snapshot.game;
  if(!game||String(game.gameId)!==gameId)
   return res.status(409).json({ok:false,error:'game_metadata_missing'});
  // Restrict internal AI destination to this deployment, never a user-supplied URL.
  const host=String(process.env.VERCEL_URL||'');
  if(!/^[a-z0-9-]+\.vercel\.app$/.test(host))throw Error('trusted_deployment_host_missing');
  const reviewAi=createManualAiAdapter({fetcher:fetch,endpoint:'https://'+host+'/api/ai-analysis'});
  const review=await runManualEvidenceAiReview({sport,game,snapshot,reviewAi});
  return res.status(200).json({ok:true,sport,gameId,...review,publicationBlocked:true});
 }catch{
  return res.status(503).json({ok:false,error:'manual_review_unavailable',publicationBlocked:true});
 }
}
