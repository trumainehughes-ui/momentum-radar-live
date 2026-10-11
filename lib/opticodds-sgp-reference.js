// Optional OpticOdds DraftKings correlation-priced SGP *reference*.
// OpticOdds is a third-party pricer: its response is NOT a sportsbook-issued
// wager ticket. It must NEVER feed BOOK_ISSUED_COMBINED_SGP verification.
// No guessing provider fixture or market identifiers from ESPN names.
// Enabled only after verified provider-side mappings and explicit opt-in.
import {LEAGUE_SGP_TARGETS} from './sgp-tier-contract.js';

const CATS={nfl:new Set(['td','passing','rushing','receiving','receptions']),
 nba:new Set(['points','rebounds','assists','threes','pra'])};
const clean=x=>String(x??'').trim(),norm=x=>clean(x).toUpperCase().replace(/[^A-Z0-9]/g,'');
const category=x=>String(x?.cat||x?.category||'').toLowerCase();
const threshold=x=>category(x)==='td'?'Anytime TD':x?.analyticsThreshold??x?.threshold??null;
const key=x=>[clean(x?.playerID||x?.playerId),category(x),String(threshold(x))].join('|');
const BOUNDS={nfl:{Small:[4,4],Medium:[5,5],Nuke:[5,7]},nba:{Small:[2,3],Medium:[3,5],Nuke:[5,7]}};
const oddsTier=odds=>Object.entries(LEAGUE_SGP_TARGETS).find(([,b])=>
 odds>=b.minimum&&(b.maximum===null||odds<=b.maximum))?.[0]||'OUTSIDE_TIER_BANDS';

export function prepareOpticOddsSgpRequest({league,gameId,risk,book='DraftKings',
 legs=[],mapping=null,now=Date.now()}={}){
 const fail=reason=>({ready:false,reason});
 if(!CATS[league]||!LEAGUE_SGP_TARGETS[risk]||book!=='DraftKings')
  return fail('UNSUPPORTED_LEAGUE_TIER_OR_BOOK');
 if(!/^\d{7,12}$/.test(clean(gameId)))return fail('INVALID_ESPN_GAME_ID');
 const [min,max]=BOUNDS[league][risk];
 if(!Array.isArray(legs)||legs.length<min||legs.length>max)return fail('INVALID_SGP_LEGS');
 if(legs.some(x=>!clean(x.playerID||x.playerId)||!CATS[league].has(category(x))||
   clean(x.gameId||x.eventID)!==clean(gameId)||!clean(x.name)||!clean(x.team)||
   (category(x)!=='td'&&(!Number.isFinite(Number(threshold(x)))||Number(threshold(x))<=0))))
  return fail('MODEL_LEG_IDENTITY_UNVERIFIED');
 const legKeys=legs.map(key);
 if(new Set(legKeys).size!==legKeys.length)return fail('DUPLICATED_PLAYER_MARKET');
 if(!mapping||mapping.espnGameId!==clean(gameId)||mapping.league!==league||
  mapping.book!=='DraftKings'||!clean(mapping.fixtureId))
  return fail('VERIFIED_PROVIDER_FIXTURE_MAPPING_REQUIRED');
 const mappedAt=Date.parse(mapping.verifiedAt||'');
 if(!Number.isFinite(mappedAt)||mappedAt>now||now-mappedAt>24*60*60*1000)
  return fail('PROVIDER_FIXTURE_MAPPING_STALE');
 const offered=Array.isArray(mapping.entries)?mapping.entries:[];
 const entries=[];
 for(const leg of legs){
  const cands=offered.filter(m=>key(m)===key(leg)&&norm(m.name)===norm(leg.name)&&
   norm(m.team)===norm(leg.team)&&clean(m.fixture_id)===clean(mapping.fixtureId));
  if(cands.length!==1||!clean(cands[0].market)||!clean(cands[0].selection))
   return fail('EXACT_PROVIDER_MARKET_MAPPING_UNAVAILABLE');
  entries.push({fixture_id:clean(mapping.fixtureId),
   market:clean(cands[0].market),name:clean(cands[0].selection)});
 }
 const uniqueness=entries.map(x=>[x.fixture_id,norm(x.market),norm(x.name)].join('|'));
 if(new Set(uniqueness).size!==uniqueness.length)
  return fail('DUPLICATED_PROVIDER_SELECTION');
 return {ready:true,league,gameId:clean(gameId),risk,book,
  entries,requestBody:{sportsbooks:['DraftKings'],entries},source:'OpticOdds'};
}
export function interpretOpticOddsSgpPrice(plan,payload,{now=Date.now()}={}){
 const fail=reason=>({status:reason,provider:'OpticOdds',book:'DraftKings',
  correlatedPrice:null,bookQuoteVerified:false});
 if(!plan?.ready||!Array.isArray(plan.entries)||!plan.entries.length)
  return fail('PRICING_REQUEST_NOT_READY');
 const value=payload?.data?.DraftKings;
 if(!value||value.error||Array.isArray(value.missing_entries)&&value.missing_entries.length)
  return fail('PROVIDER_SGP_UNAVAILABLE_OR_MISSING_MARKETS');
 if(!Array.isArray(value.legs)||value.legs.length!==plan.entries.length)
  return fail('PROVIDER_PRICE_SELECTION_MISMATCH');
 const identifier=e=>[clean(e.fixture_id),norm(e.market),norm(e.name)].join('|');
 const sent=plan.entries.map(identifier).sort();
 const received=value.legs.map(identifier).sort();
 if(sent.some(x=>!x||x.split('|').some(p=>!p))||
  sent.join('\n')!==received.join('\n'))
  return fail('PROVIDER_PRICE_SELECTION_MISMATCH');
 const americanOdds=value.price;
 if(!Number.isSafeInteger(americanOdds)||americanOdds<=0)
  return fail('PROVIDER_COMBINED_PRICE_INVALID');
 if(!Number.isFinite(now)||now<=0)return fail('INVALID_OBSERVATION_TIME');
 const net=Number((americanOdds/10).toFixed(2));
 return {status:'CORRELATED_PROVIDER_PRICE_REFERENCE',provider:'OpticOdds',
  book:'DraftKings',league:plan.league,gameId:plan.gameId,risk:plan.risk,
  sourceType:'THIRD_PARTY_CORRELATED_SGP_PRICE',
  observedAt:new Date(now).toISOString(),correlatedPrice:americanOdds,
  observedTier:oddsTier(americanOdds),
  targetTierMatched:oddsTier(americanOdds)===plan.risk,
  tenDollarNetProfit:net,tenDollarTotalReturn:Number((net+10).toFixed(2)),
  legCount:plan.entries.length,bookQuoteVerified:false,
  bookWagerAvailableVerified:false,
  note:'Provider correlation-priced reference; not a DraftKings-issued, accepted or executable ticket.'};
}
export async function requestOpticOddsSgpReference({
 plan,env={},fetcher=fetch,now=Date.now()
}={}){
 if(!plan?.ready)return {status:'PROVIDER_MAPPING_NOT_READY',bookQuoteVerified:false};
 if(env.OPTICODDS_SGP_ENABLED!=='true'||!clean(env.OPTICODDS_API_KEY))
  return {status:'PROVIDER_DISABLED_OR_UNCONFIGURED',bookQuoteVerified:false};
 try{
  const res=await fetcher('https://api.opticodds.com/api/v3/parlay/odds',{
   method:'POST',cache:'no-store',headers:{
    'X-Api-Key':env.OPTICODDS_API_KEY,'Content-Type':'application/json'},
   body:JSON.stringify(plan.requestBody),signal:AbortSignal.timeout(12000)
  });
  if(!res.ok)return{status:res.status===429?'PROVIDER_RATE_LIMITED':'PROVIDER_REQUEST_FAILED',
   bookQuoteVerified:false};
  const json=await res.json();
  return interpretOpticOddsSgpPrice(plan,json,{now});
 }catch{
  return{status:'PROVIDER_UNAVAILABLE',bookQuoteVerified:false};
 }
}
