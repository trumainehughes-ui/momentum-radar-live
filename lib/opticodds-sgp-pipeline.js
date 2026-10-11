// Optional, bounded, internal-only OpticOdds discovery + mapped parlay
// reference workflow. NOT exposed on a public route or scheduled cron.
// One use can consume paid requests, so it stays double-opt-in gated and
// returns safely without a request if credentials/crosswalk controls absent.
import {matchOpticOddsFixture,verifyOpticOddsMarketCatalog,
 buildOpticOddsMarketCrosswalk} from './opticodds-sgp-crosswalk.js';
import {prepareOpticOddsSgpRequest,
 requestOpticOddsSgpReference} from './opticodds-sgp-reference.js';

const ORIGIN='https://api.opticodds.com/api/v3';
const LEAGUES={nfl:'football',nba:'basketball'};
const MAX_PAGES=6;
const fail=(reason,requests)=>({status:reason,ready:false,requests,
 correlatedPrice:null,bookQuoteVerified:false});

export async function discoverOpticOddsSgpReference({
 league,game,legs,risk,categoryMarketNames,env={},fetcher=fetch,
 now=Date.now()
}={}){
 let requests=0;
 // Public requests and ordinary pregame collector runs NEVER call this.
 // Explicit operational activation, credentials AND curated market-name
 // mappings are required; the provider catalog verifies these names.
 if(!env.OPTICODDS_API_KEY||env.OPTICODDS_SGP_ENABLED!=='true'||
  env.OPTICODDS_DISCOVERY_ENABLED!=='true')
  return fail('OPTICODDS_DISCOVERY_DISABLED',requests);
 if(!LEAGUES[league]||!game||!/^\d{7,12}$/.test(String(game.gameId||''))||
  !['Small','Medium','Nuke'].includes(risk)||!Array.isArray(legs)||
  !legs.length||!categoryMarketNames||typeof categoryMarketNames!=='object')
  return fail('INVALID_MODEL_OR_DISCOVERY_INPUT',requests);
 const headers={'X-Api-Key':env.OPTICODDS_API_KEY,
  Accept:'application/json'};
 async function get(path,params){
  const q=new URLSearchParams(params),url=ORIGIN+path+'?'+q.toString();
  requests++;
  const r=await fetcher(url,{method:'GET',headers,cache:'no-store',
   signal:AbortSignal.timeout(10000)});
  if(r.status===429)throw Error('PROVIDER_RATE_LIMITED');
  if(!r.ok)throw Error('PROVIDER_DISCOVERY_FAILED');
  return r.json();
 }
 try{
  const marketResponse=await get('/markets',{
   sport:LEAGUES[league],league,sportsbook:'DraftKings',markets_only:'false'
  });
  const catalog=verifyOpticOddsMarketCatalog({
   league,providerMarkets:marketResponse,
   categoryNames:categoryMarketNames,now
  });
  if(!catalog.sourceVerified)return fail(catalog.reason,requests);
  const fixtureRows=[];
  let totalPages=1;
  for(let page=1;page<=totalPages;page++){
   if(page>MAX_PAGES)return fail('PROVIDER_FIXTURE_PAGE_LIMIT',requests);
   const data=await get('/fixtures/active',{
    sport:LEAGUES[league],league,page:String(page)
   });
   const reported=Number(data?.total_pages);
   if(!Array.isArray(data?.data)||!Number.isSafeInteger(reported)||
    reported<1||reported>MAX_PAGES)
    return fail('PROVIDER_FIXTURE_PAGINATION_INCOMPLETE',requests);
   if(page===1)totalPages=reported;
   else if(reported!==totalPages)
    return fail('PROVIDER_FIXTURE_PAGES_CHANGED',requests);
   fixtureRows.push(...data.data);
  }
  const match=matchOpticOddsFixture({
   league,game,fixtures:{data:fixtureRows,total_pages:1},now
  });
  if(!match.ready)return fail(match.reason,requests);
  const odds=await get('/fixtures/odds',{
   fixture_id:match.fixtureId,sportsbook:'DraftKings',odds_format:'AMERICAN'
  });
  const crosswalk=buildOpticOddsMarketCrosswalk({
   fixture:match,league,game,legs,oddsSnapshot:odds,
   marketCatalog:catalog,now
  });
  if(!crosswalk.ready)return fail(crosswalk.reason,requests);
  const plan=prepareOpticOddsSgpRequest({
   league,gameId:String(game.gameId),risk,book:'DraftKings',legs,
   mapping:{...crosswalk,espnGameId:String(game.gameId)},now
  });
  if(!plan.ready)return fail(plan.reason,requests);
  requests++;
  const priced=await requestOpticOddsSgpReference({plan,env,fetcher,now});
  return{...priced,ready:priced.status==='CORRELATED_PROVIDER_PRICE_REFERENCE',
   requests,league,gameId:String(game.gameId),risk,
   crosswalkStatus:'EXACT_PROVIDER_FIXTURE_MARKETS_MATCHED',
   bookQuoteVerified:false};
 }catch(e){
  return fail(e?.message==='PROVIDER_RATE_LIMITED'?'PROVIDER_RATE_LIMITED':
   'OPTICODDS_DISCOVERY_UNAVAILABLE',requests);
 }
}
