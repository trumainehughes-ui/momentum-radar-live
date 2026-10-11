import {list,put} from '@vercel/blob';
// Explicit, change-authorized SGP pricing. No public or routine-refresh provider spend.
const API='https://api.prop-line.com/v1';
const SPORT={nfl:'football_nfl',nba:'basketball_nba'};
const BOOKS=new Set(['draftkings','fanduel']);
const MARKETS=new Set(['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_anytime_td','player_points','player_rebounds','player_assists','player_threes']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(403).json({ok:false,error:'unauthorized'});
 const token=String(req.headers['x-momentum-change-token']||'');
 if(!/^[a-f0-9]{64}$/.test(token))return res.status(403).json({ok:false,error:'verified_change_token_required'});
 const {league='nfl',gameId='',eventId='',bookmaker='',legs=[]}=req.body||{};
 if(!SPORT[league]||!/^\d{6,12}$/.test(String(gameId))||!/^\d{1,14}$/.test(String(eventId))||!BOOKS.has(bookmaker)||!Array.isArray(legs)||legs.length<2||legs.length>10)return res.status(400).json({ok:false,error:'invalid_quote_request'});
 // Require exact bookmaker selection IDs. Never guess a selection or fabricate a price.
 if(legs.some(l=>!l||!MARKETS.has(l.market)||typeof l.book_outcome_id!=='string'||l.book_outcome_id.length<3||l.book_outcome_id.length>160))
  return res.status(400).json({ok:false,error:'verified_book_selection_ids_required'});
 const path='momentum-nfl-change-tokens/v1/'+token+'.json';
 let record;
 try{const blobs=await list({prefix:path,limit:5});const found=blobs.blobs?.find(b=>b.pathname===path);if(found){const r=await fetch(found.url,{signal:AbortSignal.timeout(2500)});if(r.ok)record=await r.json()}}catch{return res.status(503).json({ok:false,error:'token_store_unavailable'})}
 const age=Date.now()-Date.parse(record?.createdAt||'');
 if(!record||String(record.gameId)!==String(gameId)||!Number.isFinite(age)||age<0||age>900000||record.changeCount<1)return res.status(403).json({ok:false,error:'change_token_invalid'});
 if(!process.env.PLAYER_PROPS_API_KEY)return res.status(503).json({ok:false,error:'provider_not_configured'});
 // One quote attempt per verified change and bookmaker. Fail closed on concurrent claims.
 try{await put('momentum-propline-sgp-claims/v1/'+token+'/'+bookmaker+'.json',JSON.stringify({gameId,eventId,at:new Date().toISOString()}),{access:'public',addRandomSuffix:false,allowOverwrite:false})}catch{return res.status(409).json({ok:false,error:'quote_already_attempted'})}
 try{
  const r=await fetch(API+'/sports/'+SPORT[league]+'/events/'+eventId+'/sgp',{method:'POST',headers:{'X-API-Key':process.env.PLAYER_PROPS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({bookmaker,legs:legs.map(l=>({book_outcome_id:l.book_outcome_id,market:l.market}))}),signal:AbortSignal.timeout(12000)});
  const data=await r.json().catch(()=>({}));
  const remaining=r.headers.get('x-daily-remaining');
  if(!r.ok)return res.status(502).json({ok:false,error:'quote_provider_rejected',providerStatus:r.status,remaining:remaining===null?null:Number(remaining)});
  const quoted=data.quoted===true&&data.redacted!==true&&Number.isFinite(Number(data.sgp_price))&&data.legs?.length===legs.length&&data.legs.every(l=>l.accepted===true);
  return res.status(200).json({ok:true,quoted,bookmaker,eventId,americanOdds:quoted?Number(data.sgp_price):null,pricedAt:quoted?data.priced_at:null,legsAccepted:quoted?legs.length:0,remaining:remaining===null?null:Number(remaining),status:quoted?'BOOK_QUOTED':'BOOK_DECLINED_OR_REDACTED'});
 }catch{return res.status(502).json({ok:false,error:'quote_provider_unavailable'})}
}
