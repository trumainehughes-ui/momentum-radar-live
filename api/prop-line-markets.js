import {list,put} from '@vercel/blob';
import {propLineEventMatchesDate,normalizePropLinePlayerOffer} from '../lib/prop-line-nfl-normalization.js';
// Server-only PropLine integration. No credentials or raw provider errors reach clients.
const API='https://api.prop-line.com/v1';
const SPORTS={nfl:'football_nfl',nba:'basketball_nba'};
const MARKETS={nfl:['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_anytime_td'],nba:['player_points','player_rebounds','player_assists','player_threes']};
const books=new Set(['draftkings','fanduel']);
const safeDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
async function load(url,key){
 const response=await fetch(url,{headers:{'X-API-Key':key,Accept:'application/json'},signal:AbortSignal.timeout(7000)});
 const quota={remaining:Number(response.headers.get('x-daily-remaining')),limit:Number(response.headers.get('x-daily-limit'))};
 if(!response.ok)return{error:response.status===429?'rate_limited':response.status===401?'invalid_key':response.status===403?'plan_restricted':'provider_unavailable',status:response.status,quota};
 return{data:await response.json(),quota};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 // Prevent unauthenticated public calls from consuming paid provider credits.
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)
  return res.status(403).json({ok:false,error:'authorized_change_refresh_required'});
 const eventToken=String(req.headers['x-momentum-change-token']||'');
 if(!/^[a-f0-9]{64}$/.test(eventToken))return res.status(403).json({ok:false,error:'verified_change_token_required'});
 const tokenPath='momentum-nfl-change-tokens/v1/'+eventToken+'.json';
 let tokenRecord=null;
 try{
  const records=await list({prefix:tokenPath,limit:5});
  const item=records.blobs?.find(x=>x.pathname===tokenPath);
  if(item){const result=await fetch(item.url,{signal:AbortSignal.timeout(2500)});if(result.ok)tokenRecord=await result.json()}
 }catch{return res.status(503).json({ok:false,error:'change_token_store_unavailable'})}
 if(!tokenRecord||tokenRecord.usedAt||Date.now()-Date.parse(tokenRecord.createdAt)>15*60*1000||tokenRecord.gameId!==String(req.query.gameId||''))return res.status(403).json({ok:false,error:'change_token_invalid_or_used'});
 // Atomic create-only claim: the Blob store rejects a second writer to this exact path.
 if(!process.env.PLAYER_PROPS_API_KEY)return res.status(503).json({ok:false,error:'prop_line_not_configured'});
 if(!SPORTS[String(req.query.league||'nfl').toLowerCase()])return res.status(400).json({ok:false,error:'unsupported_league'});
 if(!safeDate(String(req.query.date||new Date().toISOString().slice(0,10))))return res.status(400).json({ok:false,error:'invalid_date'});
 if(!/^[0-9]{6,12}$/.test(String(req.query.gameId||'')))return res.status(400).json({ok:false,error:'invalid_game_id'});
 if(req.query.eventId&&!/^[0-9]{1,14}$/.test(String(req.query.eventId)))return res.status(400).json({ok:false,error:'invalid_event_id'});
 const claimPath='momentum-nfl-change-claims/v1/'+eventToken+'.json';
 try{
  await put(claimPath,JSON.stringify({gameId:tokenRecord.gameId,claimedAt:new Date().toISOString()}),{access:'public',addRandomSuffix:false,allowOverwrite:false});
 }catch{return res.status(409).json({ok:false,error:'change_already_claimed_or_claim_store_unavailable'})}
 const key=process.env.PLAYER_PROPS_API_KEY;
 if(!key)return res.status(503).json({ok:false,error:'prop_line_not_configured'});
 const league=String(req.query.league||'nfl').toLowerCase();
 if(!SPORTS[league])return res.status(400).json({ok:false,error:'unsupported_league'});
 const date=String(req.query.date||new Date().toISOString().slice(0,10));
 if(!safeDate(date))return res.status(400).json({ok:false,error:'invalid_date'});
 const gameId=String(req.query.gameId||'');
 if(gameId&&!/^\d{6,12}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_game_id'});
 try{
  const sport=SPORTS[league];
  const eventsResult=await load(API+'/sports/'+sport+'/events',key);
  if(eventsResult.error)return res.status(502).json({ok:false,provider:'PropLine',error:eventsResult.error,providerStatus:eventsResult.status});
  const events=Array.isArray(eventsResult.data)?eventsResult.data:eventsResult.data?.events||[];
  let matches=events.filter(e=>propLineEventMatchesDate(e,date,league)&&(!gameId||String(e.espn_event_id||'')===gameId));
  // PropLine documents ESPN IDs on NFL event records; never call an undocumented /ids route.
  // If the ESPN ID is missing, return a clear event-not-matched result rather than guessing.
  const eventId=String(req.query.eventId||'');
  if(eventId&&!/^\d{1,14}$/.test(eventId))return res.status(400).json({ok:false,error:'invalid_event_id'});
  const chosen=eventId?matches.find(e=>String(e.id)===eventId):gameId?matches[0]:null;
  if(!chosen)return res.status(200).json({ok:true,provider:'PropLine',league,date,events:matches.map(e=>({id:String(e.id),espnGameId:e.espn_event_id||null,home:e.home_team,away:e.away_team,kickoff:e.commence_time})),offers:[],status:gameId||eventId?'event_not_matched':'event_selection_required'});
  const params=new URLSearchParams({markets:MARKETS[league].join(','),bookmakers:'draftkings,fanduel',includeBookIds:'true'});
  const odds=await load(API+'/sports/'+sport+'/events/'+encodeURIComponent(String(chosen.id))+'/odds?'+params,key);
  if(odds.error)return res.status(502).json({ok:false,provider:'PropLine',error:odds.error,providerStatus:odds.status});
  const offers=[];
  for(const book of odds.data?.bookmakers||[]){
   if(!books.has(book.key))continue;
   for(const market of book.markets||[]){
    if(!MARKETS[league].includes(market.key))continue;
    for(const outcome of market.outcomes||[]){
     const normalized=normalizePropLinePlayerOffer(book,market,outcome);
     if(normalized)offers.push(normalized);
    }
   }
  }
  return res.status(200).json({ok:true,provider:'PropLine',league,date,event:{id:String(chosen.id),espnGameId:chosen.espn_event_id||null,home:chosen.home_team,away:chosen.away_team,kickoff:chosen.commence_time},offers,bookCounts:{DraftKings:offers.filter(x=>x.book==='draftkings').length,FanDuel:offers.filter(x=>x.book==='fanduel').length},quotaRemaining:Number.isFinite(odds.quota.remaining)?odds.quota.remaining:null,combinedSgpQuoteVerified:false});
 }catch(e){return res.status(502).json({ok:false,provider:'PropLine',error:'upstream_request_failed'})}
}
