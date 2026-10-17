import {list,put} from '@vercel/blob';
import {verifyPropLineSgpResponse} from '../lib/prop-line-sgp-quote-verification.js';
import {exactPropLineSgpLeg} from '../lib/prop-line-sgp-leg-identity.js';
import {validNflCheckpointToken,NFL_CHECKPOINT_MAX_QUOTES} from '../lib/nfl-scheduled-book-checkpoint.js';
// Explicit, change-authorized SGP pricing. No public or routine-refresh provider spend.
const API='https://api.prop-line.com/v1';
const SPORT={nfl:'football_nfl',nba:'basketball_nba'};
const BOOKS=new Set(['draftkings','fanduel']);
const NFL_TIER_LEGS={Small:[4,4],Medium:[5,5],Nuke:[5,7]};
const MARKETS=new Set(['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_anytime_td','player_points','player_rebounds','player_assists','player_threes']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(403).json({ok:false,error:'unauthorized'});
 const token=String(req.headers['x-momentum-change-token']||'');
 if(!/^[a-f0-9]{64}$/.test(token))return res.status(403).json({ok:false,error:'verified_change_token_required'});
 const {league='nfl',gameId='',eventId='',bookmaker='',risk='',legs=[]}=req.body||{};
 if(!SPORT[league]||!/^\d{6,12}$/.test(String(gameId))||!/^\d{1,14}$/.test(String(eventId))||!BOOKS.has(bookmaker)||!Array.isArray(legs)||legs.length<2||legs.length>10)return res.status(400).json({ok:false,error:'invalid_quote_request'});
 // NFL tier claims are independently bounded: one Small, Medium and Nuke quote
 // per book for one verified change, never ordinary UI polling.
 if(league==='nfl'&&(!NFL_TIER_LEGS[risk]||legs.length<NFL_TIER_LEGS[risk][0]||legs.length>NFL_TIER_LEGS[risk][1]))return res.status(400).json({ok:false,error:'invalid_nfl_sgp_tier_or_leg_count'});
 // Require exact bookmaker selection IDs. Never guess a selection or fabricate a price.
 if(legs.some(l=>!l||!MARKETS.has(l.market)||
   (league==='nfl'?!exactPropLineSgpLeg(l):
    typeof l.book_outcome_id!=='string'||l.book_outcome_id.length<3||
    l.book_outcome_id.length>160)))
  return res.status(400).json({ok:false,error:'verified_book_selection_ids_or_exact_native_leg_required'});
 const path='momentum-nfl-change-tokens/v1/'+token+'.json';
 let record;
 try{const blobs=await list({prefix:path,limit:5});const found=blobs.blobs?.find(b=>b.pathname===path);if(found){const r=await fetch(found.url,{signal:AbortSignal.timeout(2500)});if(r.ok)record=await r.json()}}catch{return res.status(503).json({ok:false,error:'token_store_unavailable'})}
 const age=Date.now()-Date.parse(record?.createdAt||'');
 if(!record||String(record.gameId)!==String(gameId)||!Number.isFinite(age)||age<0||age>900000||
    !(Number(record.changeCount)>=1||(league==='nfl'&&validNflCheckpointToken(record,gameId))))return res.status(403).json({ok:false,error:'change_token_invalid'});
 if(!process.env.PLAYER_PROPS_API_KEY)return res.status(503).json({ok:false,error:'provider_not_configured'});
 // Each NFL tier is single-use for this bookmaker and verified change, preventing
 // duplicate spend while allowing all three properly constructed tiers.
 const claimPath='momentum-propline-sgp-claims/v1/'+token+'/'+bookmaker+(league==='nfl'?'/'+risk:'')+'.json';
 try{await put(claimPath,JSON.stringify({gameId,eventId,risk:league==='nfl'?risk:null,at:new Date().toISOString()}),{access:'public',addRandomSuffix:false,allowOverwrite:false})}catch{return res.status(409).json({ok:false,error:'quote_already_attempted'})}
 // Checkpoint pricing uses at most three provider quote requests across
 // BOTH sportsbooks and ALL tiers; atomic slots enforce this even if the
 // caller retries or independently tries to quote additional tiers.
 if(league==='nfl'&&record.source==='NFL_SCHEDULED_CHECKPOINT'){
  let slotClaimed=false;
  for(let slot=0;slot<NFL_CHECKPOINT_MAX_QUOTES;slot++){
   try{
    await put('momentum-propline-sgp-claims/v1/'+token+'/slots/'+slot+'.json',
     JSON.stringify({gameId,eventId,bookmaker,risk,at:new Date().toISOString()}),
     {access:'public',addRandomSuffix:false,allowOverwrite:false});
    slotClaimed=true;break;
   }catch{/* Occupied or unavailable: never bypass the cap. */}
  }
  if(!slotClaimed)
   return res.status(409).json({ok:false,error:'checkpoint_quote_budget_exhausted'});
 }
 try{
  const r=await fetch(API+'/sports/'+SPORT[league]+'/events/'+eventId+'/sgp',{method:'POST',headers:{'X-API-Key':process.env.PLAYER_PROPS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({bookmaker,legs:legs.map(l=>league==='nfl'?exactPropLineSgpLeg(l):({book_outcome_id:l.book_outcome_id,market:l.market}))}),signal:AbortSignal.timeout(12000)});
  const data=await r.json().catch(()=>({}));
  const remaining=r.headers.get('x-daily-remaining');
  if(!r.ok){
   console.warn('[sgp-quote] provider_rejected',JSON.stringify({league,bookmaker,risk,providerStatus:r.status}));
   return res.status(502).json({ok:false,error:'quote_provider_rejected',providerStatus:r.status,remaining:remaining===null?null:Number(remaining)});
  }
  const verified=verifyPropLineSgpResponse({league,gameId,eventId,bookmaker,legs},data);
  console.info('[sgp-quote] validation',JSON.stringify({league,bookmaker,risk,quoted:verified.quoted,reason:verified.reason,legCount:legs.length}));
  return res.status(200).json({ok:true,quoted:verified.quoted,bookmaker,eventId,americanOdds:verified.americanOdds,pricedAt:verified.pricedAt,legsAccepted:verified.legsAccepted,remaining:remaining===null?null:Number(remaining),status:verified.quoted?'PROVIDER_BOOK_COMBINED_QUOTE':'BOOK_QUOTE_NOT_VERIFIED',reason:verified.reason});
 }catch{return res.status(502).json({ok:false,error:'quote_provider_unavailable'})}
}
