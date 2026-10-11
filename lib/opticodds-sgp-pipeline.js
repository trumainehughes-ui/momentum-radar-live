// Optional, bounded, internal-only OpticOdds discovery + mapped parlay
// reference workflow. NOT exposed on a public route or scheduled cron.
// One use can consume paid requests, so it stays double-opt-in gated and
// returns safely without a request if credentials/crosswalk controls absent.
import {matchOpticOddsFixture,verifyOpticOddsMarketCatalog,
 verifyOpticOddsPlayerRosters,buildOpticOddsMarketCrosswalk} from './opticodds-sgp-crosswalk.js';
import {prepareOpticOddsSgpRequest,
 requestOpticOddsSgpReference} from './opticodds-sgp-reference.js';

const ORIGIN='https://api.opticodds.com/api/v3';
const LEAGUES={nfl:'football',nba:'basketball'};
const MAX_PAGES=6,MAX_ROSTER_PAGES=3;
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
 const budget=Number(env.OPTICODDS_MAX_CALLS_PER_RUN);
 if(!Number.isSafeInteger(budget)||budget<1||budget>30)
  return fail('EXPLICIT_PROVIDER_CALL_BUDGET_REQUIRED',requests);
 if(!LEAGUES[league]||!game||!/^\d{7,12}$/.test(String(game.gameId||''))||
  !['Small','Medium','Nuke'].includes(risk)||!Array.isArray(legs)||
  !legs.length||!categoryMarketNames||typeof categoryMarketNames!=='object')
  return fail('INVALID_MODEL_OR_DISCOVERY_INPUT',requests);
 const headers={'X-Api-Key':env.OPTICODDS_API_KEY,
  Accept:'application/json'};
 async function get(path,params){
  if(requests>=budget)throw Error('PROVIDER_REQUEST_BUDGET_EXCEEDED');
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
  const kickoff=Date.parse(game.kickoff);
  if(!Number.isFinite(kickoff)||kickoff<=now)
   return fail('INVALID_UPCOMING_GAME_KICKOFF',requests);
  let hasMore=true,page=1;
  while(hasMore){
   if(page>MAX_PAGES)return fail('PROVIDER_FIXTURE_PAGE_LIMIT',requests);
   const data=await get('/fixtures/active',{
    sport:LEAGUES[league],league,page:String(page),
    start_date_after:new Date(kickoff-60*60000).toISOString(),
    start_date_before:new Date(kickoff+60*60000).toISOString()
   });
   if(!Array.isArray(data?.data)||data?.page!==page||
    typeof data.has_more!=='boolean')
    return fail('PROVIDER_FIXTURE_PAGINATION_INCOMPLETE',requests);
   fixtureRows.push(...data.data);
   hasMore=data.has_more;
   page++;
  }
  const match=matchOpticOddsFixture({
   league,game,fixtures:{data:fixtureRows,has_more:false},now
  });
  if(!match.ready)return fail(match.reason,requests);
  const teamPages={};
  for(const [team,teamId] of [
   [match.homeAbbr,match.homeTeamId],[match.awayAbbr,match.awayTeamId]
  ]){
   const pages=[];
   let more=true,page=1;
   while(more){
    if(page>MAX_ROSTER_PAGES)return fail('PROVIDER_PLAYER_PAGE_LIMIT',requests);
    const data=await get('/players',{
     sport:LEAGUES[league],league,team_id:teamId,page:String(page)
    });
    if(!Array.isArray(data?.data)||data.page!==page||
      typeof data.has_more!=='boolean')
     return fail('PROVIDER_PLAYER_PAGINATION_INCOMPLETE',requests);
    pages.push(data);
    more=data.has_more;page++;
   }
   teamPages[team]=pages;
  }
  const playerCrosswalk=verifyOpticOddsPlayerRosters({
   league,fixture:match,legs,teamPages,now
  });
  if(!playerCrosswalk.ready)return fail(playerCrosswalk.reason,requests);
  const odds=await get('/fixtures/odds',{
   fixture_id:match.fixtureId,sportsbook:'DraftKings',odds_format:'AMERICAN'
  });
  const crosswalk=buildOpticOddsMarketCrosswalk({
   fixture:match,league,game,legs,oddsSnapshot:odds,
   marketCatalog:catalog,playerCrosswalk,now
  });
  if(!crosswalk.ready)return fail(crosswalk.reason,requests);
  const plan=prepareOpticOddsSgpRequest({
   league,gameId:String(game.gameId),risk,book:'DraftKings',legs,
   mapping:{...crosswalk,espnGameId:String(game.gameId)},now
  });
  if(!plan.ready)return fail(plan.reason,requests);
  if(requests>=budget)return fail('PROVIDER_REQUEST_BUDGET_EXCEEDED',requests);
  requests++;
  const priced=await requestOpticOddsSgpReference({plan,env,fetcher,now});
  return{...priced,ready:priced.status==='CORRELATED_PROVIDER_PRICE_REFERENCE',
   requests,league,gameId:String(game.gameId),risk,
   crosswalkStatus:'EXACT_PROVIDER_FIXTURE_MARKETS_MATCHED',
   bookQuoteVerified:false};
 }catch(e){
  return fail(e?.message==='PROVIDER_RATE_LIMITED'?'PROVIDER_RATE_LIMITED':
   e?.message==='PROVIDER_REQUEST_BUDGET_EXCEEDED'?
    'PROVIDER_REQUEST_BUDGET_EXCEEDED':'OPTICODDS_DISCOVERY_UNAVAILABLE',requests);
 }
}
