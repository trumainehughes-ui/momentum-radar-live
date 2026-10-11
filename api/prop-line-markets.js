// Server-only PropLine integration. No credentials or raw provider errors reach clients.
const API='https://api.prop-line.com/v1';
const SPORTS={nfl:'football_nfl',nba:'basketball_nba'};
const MARKETS={nfl:['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_anytime_td'],nba:['player_points','player_rebounds','player_assists','player_threes']};
const books=new Set(['draftkings','fanduel']);
const safeDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
const isoDate=s=>new Date(s).toISOString().slice(0,10);
async function load(url,key){
 const response=await fetch(url,{headers:{'X-API-Key':key,Accept:'application/json'},signal:AbortSignal.timeout(7000)});
 const quota={remaining:Number(response.headers.get('x-daily-remaining')),limit:Number(response.headers.get('x-daily-limit'))};
 if(!response.ok)return{error:response.status===429?'rate_limited':response.status===401?'invalid_key':response.status===403?'plan_restricted':'provider_unavailable',status:response.status,quota};
 return{data:await response.json(),quota};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
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
  const matches=events.filter(e=>{try{return isoDate(e.commence_time)===date&&(!gameId||String(e.espn_event_id||'')===gameId)}catch{return false}});
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
     if(!Number.isFinite(Number(outcome.price))||!outcome.description)continue;
     offers.push({book:book.key,market:market.key,player:outcome.description,side:outcome.name,point:outcome.point??null,americanOdds:Number(outcome.price),bookOutcomeId:outcome.book_outcome_id||null,updatedAt:market.last_update||null});
    }
   }
  }
  return res.status(200).json({ok:true,provider:'PropLine',league,date,event:{id:String(chosen.id),espnGameId:chosen.espn_event_id||null,home:chosen.home_team,away:chosen.away_team,kickoff:chosen.commence_time},offers,bookCounts:{DraftKings:offers.filter(x=>x.book==='draftkings').length,FanDuel:offers.filter(x=>x.book==='fanduel').length},quotaRemaining:Number.isFinite(odds.quota.remaining)?odds.quota.remaining:null,combinedSgpQuoteVerified:false});
 }catch(e){return res.status(502).json({ok:false,provider:'PropLine',error:'upstream_request_failed'})}
}
