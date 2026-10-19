// Secondary sportsbook comparison only. DraftKings/FanDuel public pages remain primary.
// Never use this endpoint as proof of a playable correlated same-game parlay.
const BASE='https://api.theoddsapi.com';
const SPORTS={nfl:'americanfootball_nfl',nba:'basketball_nba'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.authorization!=='Bearer '+secret)
  return res.status(401).json({ok:false,error:'collector_authorization_required'});
 const sport=String(req.query?.sport||'').toLowerCase();
 if(!SPORTS[sport])return res.status(400).json({ok:false,error:'sport_must_be_nfl_or_nba'});
 const key=process.env.THEODDSAPI_API_KEY;
 if(!key)return res.status(503).json({ok:false,error:'supplementary_key_not_configured'});
 try{
  const url=new URL('/odds/',BASE);
  url.searchParams.set('sport_key',SPORTS[sport]);
  url.searchParams.set('markets','h2h,spreads,totals');
  url.searchParams.set('bookmakers','draftkings,fanduel');
  const r=await fetch(url,{headers:{'x-api-key':key,Accept:'application/json'},
   cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!r.ok)return res.status(r.status===401?502:503).json({ok:false,
   error:r.status===401?'supplementary_key_rejected':'supplementary_provider_unavailable',
   providerStatus:r.status});
  const payload=await r.json();
  if(payload?.success!==true||!Array.isArray(payload.data))
   return res.status(502).json({ok:false,error:'unexpected_provider_response'});
  const games=payload.data.map(g=>({
   eventId:String(g.event_id||''),home:String(g.home_team||''),away:String(g.away_team||''),
   startsAt:g.start_time||null,books:(g.books||[]).filter(b=>
    ['draftkings','fanduel'].includes(String(b.book||'').toLowerCase())).map(b=>({
     book:b.book,market:b.market,updatedAt:b.updated_at||null,
     outcomes:(b.outcomes||[]).map(o=>({name:o.name,price:o.price,point:o.point??null}))
   }))
  }));
  return res.status(200).json({ok:true,sport,source:'TheOddsAPI',
   sourceRole:'SECONDARY_CROSS_CHECK',marketScope:['h2h','spreads','totals'],
   playerPropsIncluded:false,correlatedSgpQuoteVerified:false,
   checkedAt:new Date().toISOString(),games});
 }catch{return res.status(503).json({ok:false,error:'supplementary_provider_connection_failed'})}
}
