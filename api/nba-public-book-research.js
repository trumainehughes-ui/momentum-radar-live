// Public NBA bookmaker research. Source HTML is read-only, scoped by a
// validated NBA scoreboard game and current game-specific model candidates.
import {NBA_DKN_LISTINGS,NBA_FANDUEL_PUBLIC,parseNbaDkPublicProps,onlyKnownNbaPlayers,onlyRosterListedNbaOffers} from '../lib/nba-public-book-observer.js';
const ORIGIN='https://momentum-radar-live.vercel.app';
const readJson=async url=>{
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error('trusted_nba_source_unavailable');return r.json();
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','public,s-maxage=300,stale-while-revalidate=60');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 const at=Date.parse(date+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(at)||
  new Date(at).toISOString().slice(0,10)!==date||!/^\d{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'invalid_date_or_game'});
 if(at<Date.now()-2*86400000||at>Date.now()+21*86400000)
  return res.status(400).json({ok:false,error:'outside_current_slate'});
 try{
  const [slate,report]=await Promise.all([
   readJson(ORIGIN+'/api/nba-slate?date='+encodeURIComponent(date)),
   readJson(ORIGIN+'/api/nba-game?gameId='+encodeURIComponent(gameId))
  ]);
  const game=(slate?.games||[]).find(x=>String(x.gameId)===gameId);
  if(slate?.ok!==true||slate.date!==date||!game||report?.ok!==true||
   String(report.gameId)!==gameId)
   return res.status(404).json({ok:false,error:'nba_matchup_identity_unverified'});
  let html=null,dkStatus='SOURCE_UNAVAILABLE';
  try{
   const r=await fetch(NBA_DKN_LISTINGS,{cache:'no-store',
    headers:{Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(6500)});
   if(r.ok&&/text\/html|application\/xhtml/i.test(r.headers.get('content-type')||'')){
    html=(await r.text()).slice(0,2500000);dkStatus='PUBLIC_PAGE_READ';
   }else dkStatus='PUBLIC_SOURCE_HTTP_'+r.status;
  }catch{dkStatus='PUBLIC_SOURCE_UNREACHABLE'}
  const raw=html?parseNbaDkPublicProps(html,{date,game}):[];
  const verifiedModel=onlyKnownNbaPlayers(raw,report,game);
  // When first NBA pregame models are not ready, independently check ESPN
  // current team rosters so public prices needn't vanish behind model status.
  const rosters=await Promise.all([game.home,game.away].map(async team=>{
   if(!/^\d{1,4}$/.test(String(team.id||'')))return null;
   try{
    const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/'+
     encodeURIComponent(team.id)+'/roster',{cache:'no-store',
      signal:AbortSignal.timeout(6000)});
    if(!r.ok)return null;
    return {team:team.abbr,data:await r.json()};
   }catch{return null;}
  }));
  const rostered=onlyRosterListedNbaOffers(raw,{
   home:game.home,away:game.away,rosters:rosters.filter(Boolean),
   injuries:report.injuries||[]});
  const keys=new Set();
  const matched=[...verifiedModel,...rostered].filter(o=>{
   const key=o.player+'|'+o.category+'|'+o.side+'|'+o.line;
   if(keys.has(key))return false;keys.add(key);return true;
  });
  const checkedAt=new Date().toISOString();
  return res.status(200).json({ok:true,date,gameId,
   status:matched.length?'PUBLIC_OFFERS_OBSERVED':
    raw.length?'NO_VALIDATED_PLAYERS':'NO_MATCHING_PUBLIC_ROWS',
   offers:matched,checkedAt,
   books:[{book:'DraftKings',sourceUrl:NBA_DKN_LISTINGS,status:dkStatus,
    observedOffers:matched.length},{book:'FanDuel',sourceUrl:NBA_FANDUEL_PUBLIC,
    status:'JAVASCRIPT_RENDERED_STOREFRONT_NOT_PARSED',observedOffers:0}],
   sourceHealth:{DraftKings:{state:dkStatus,verifiedPropRows:matched.length},
    FanDuel:{state:'JAVASCRIPT_RENDERED_STOREFRONT_NOT_PARSED',verifiedPropRows:0,
     requiresMachineReadableMarketFeed:true,noPriceInference:true}},
   verifiedCombinedSgpQuotes:0,
   note:'Public listings are not authenticated current bettable offers. No FanDuel or combined SGP prices have been inferred.'});
 }catch{return res.status(503).json({ok:false,error:'nba_public_market_source_unavailable'});}
}