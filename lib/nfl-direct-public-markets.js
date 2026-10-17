// First-party public sportsbook web observations, never a third-party odds API.
// No sportsbook page is allowed to create a correlated SGP price by itself.
import {
 DKN_NFL_PROPS_URL,FANDUEL_NFL_PUBLIC_URL,
 parseDraftKingsNetworkNflProps
} from './nfl-public-sportsbook-observer.js';

const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const marketKey={
 td:'player_anytime_td',passing:'player_pass_yds',
 rushing:'player_rush_yds',receiving:'player_reception_yds',
 receptions:'player_receptions'
};
const statKey={
 td:'touchdowns',passing:'passing yards',rushing:'rushing yards',
 receiving:'receiving yards',receptions:'receptions'
};
function pageState(r,html){
 if(!r.ok)return 'HTTP_'+r.status;
 if(!/text\/html|application\/xhtml/i.test(r.headers.get('content-type')||''))
  return 'NON_HTML_RESPONSE';
 if(/enable javascript|javascript is required|please enable javascript/i.test(html))
  return 'JAVASCRIPT_RENDERED';
 return 'FETCHED';
}
async function readPage(fetchImpl,url){
 try{
  const r=await fetchImpl(url,{cache:'no-store',
   headers:{Accept:'text/html,application/xhtml+xml'},
   signal:AbortSignal.timeout(7000)});
  const html=r.ok?(await r.text()).slice(0,2000000):'';
  return{state:pageState(r,html),html};
 }catch(e){
  return{state:e?.name==='TimeoutError'?'TIMEOUT':'FETCH_FAILED',html:''};
 }
}
export function draftKingsVisibleOffersToMarkets(offers,{gameId}={}){
 if(!/^\d{7,12}$/.test(String(gameId||'')))return [];
 return(Array.isArray(offers)?offers:[]).flatMap(x=>{
  const cat=x?.category,market=marketKey[cat],odds=Number(x?.odds);
  if(x?.book!=='DraftKings'||!market||!x?.player||
     !Number.isSafeInteger(odds)||odds===0||!x?.observedAt||
     cat!=='td'&&(!Number.isFinite(Number(x.line))||Number(x.line)<=0))
   return [];
  const line=cat==='td'?null:Number(x.line);
  return[{
   eventID:String(gameId),playerID:norm(x.player),
   name:String(x.player),team:'',marketName:market,statID:statKey[cat],
   periodID:'game',betTypeID:cat==='td'?'yn':'ou',
   sideID:cat==='td'?'yes':'over',line,
   books:[{book:'DraftKings',line,odds,available:true,
    checkedAt:x.observedAt,sourceUrl:DKN_NFL_PROPS_URL,
    sourceProvider:'DraftKings public web',observationOnly:true}],
   provider:'DraftKings public web observation'
  }];
 });
}
export async function observeNflDirectPublicMarkets({
 date,gameId,home,away,fetchImpl=fetch,now=Date.now()
}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||
    !/^\d{7,12}$/.test(String(gameId||''))||!home||!away)
  throw Error('invalid_game_scope');
 // Both publishers are checked directly; a JS-rendered FanDuel page never
 // borrows a DraftKings line or produces fictitious FanDuel prices.
 const [dk,fd]=await Promise.all([
  readPage(fetchImpl,DKN_NFL_PROPS_URL),
  readPage(fetchImpl,FANDUEL_NFL_PUBLIC_URL)
 ]);
 const offers=dk.state==='FETCHED'?
  parseDraftKingsNetworkNflProps(dk.html,{date,home,away,now}):[];
 const rows=draftKingsVisibleOffersToMarkets(offers,{gameId});
 return{rows,checkedAt:new Date(now).toISOString(),
  sources:{
   DraftKings:{website:'dknetwork.draftkings.com',state:dk.state,
    exactObservedOffers:rows.length,coverage:'MOST_BET_PUBLIC_PROPS_NOT_FULL_SLATE'},
   FanDuel:{website:'sportsbook.fanduel.com',state:fd.state,
    exactObservedOffers:0,coverage:'NO_STRUCTURED_PLAYER_MARKETS_PARSED'}
  },
  sourcePolicy:'DIRECT_PUBLIC_BOOKMAKER_PAGES_NO_THIRD_PARTY_ODDS_API',
  combinedSgpQuoteVerified:false};
}
