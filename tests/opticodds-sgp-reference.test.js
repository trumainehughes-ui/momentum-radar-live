import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOpticOddsSgpRequest,interpretOpticOddsSgpPrice,
 requestOpticOddsSgpReference} from '../lib/opticodds-sgp-reference.js';
import {pregameReadiness} from '../api/pregame-readiness.js';

const time=Date.parse('2026-10-11T12:00:00Z'),gameId='401872981',fixtureId='nfl:OPTIC_VERIFIED_FIXTURE';
const legs=[
 ['Trevor Lawrence','11','JAX','passing',180],
 ['Bhayshul Tuten','22','JAX','rushing',65],
 ['Parker Washington','33','JAX','receiving',60],
 ['Chris Rodriguez Jr.','44','JAX','rushing',20],
 ['Brenton Strange','55','JAX','receiving',30]
].map(([name,playerID,team,cat,analyticsThreshold])=>({
 name,playerID,team,cat,analyticsThreshold,eventID:gameId
}));
const mapping={
 league:'nfl',book:'DraftKings',espnGameId:gameId,fixtureId,
 verifiedAt:new Date(time-120000).toISOString(),
 entries:legs.map(l=>({...l,fixture_id:fixtureId,
  market:l.cat==='passing'?'Player Passing Yards':
   l.cat==='rushing'?'Player Rushing Yards':'Player Receiving Yards',
  selection:l.name+' Over '+(l.analyticsThreshold-0.5)}))
};
const prepare=(overrides={})=>prepareOpticOddsSgpRequest({
 league:'nfl',gameId,risk:'Medium',book:'DraftKings',
 legs,mapping,now:time,...overrides
});
const providerResponse=(plan,values={})=>({
 data:{DraftKings:{error:null,missing_entries:null,
  price:3800,legs:plan.entries.map(l=>({...l,price:-110})),...values}}
});
test('with verified event and all exact OpticOdds market names, build only a DraftKings correlation-price request',()=>{
 const p=prepare();
 assert.equal(p.ready,true);
 assert.deepEqual(p.requestBody.sportsbooks,['DraftKings']);
 assert.equal(p.requestBody.entries.length,5);
 assert.equal(p.requestBody.entries[0].fixture_id,fixtureId);
 assert.equal(p.requestBody.entries[0].name,'Trevor Lawrence Over 179.5');
 assert.ok(!JSON.stringify(p).includes('x-api-key'));
});
test('missing/stale/mismatched provider crosswalk, unsupported FanDuel and wrong game prevent pricing',()=>{
 for(const override of [
  {book:'FanDuel'},{mapping:null},{mapping:{...mapping,fixtureId:''}},
  {mapping:{...mapping,espnGameId:'401872982'}},
  {mapping:{...mapping,verifiedAt:new Date(time-25*3600000).toISOString()}},
  {mapping:{...mapping,entries:mapping.entries.slice(1)}},
  {mapping:{...mapping,entries:mapping.entries.map((e,i)=>i===0?{...e,team:'PHI'}:e)}},
  {legs:legs.map((l,i)=>i===0?{...l,eventID:'401872982'}:l)},
  {legs:legs.slice(0,4)}
 ]){
  const p=prepare(override);
  assert.equal(p.ready,false,JSON.stringify(override).slice(0,180));
 }
});
test('third-party correlated +3800 is a Medium REFERENCE but never a bookmaker-issued ticket',()=>{
 const p=prepare();
 const result=interpretOpticOddsSgpPrice(p,providerResponse(p),{now:time});
 assert.equal(result.status,'CORRELATED_PROVIDER_PRICE_REFERENCE');
 assert.equal(result.targetTierMatched,true);
 assert.equal(result.correlatedPrice,3800);
 assert.equal(result.tenDollarNetProfit,380);
 assert.equal(result.tenDollarTotalReturn,390);
 assert.equal(result.sourceType,'THIRD_PARTY_CORRELATED_SGP_PRICE');
 assert.equal(result.bookQuoteVerified,false);
 assert.equal(result.bookWagerAvailableVerified,false);
});
test('provider +975 remains outside Medium even when correlation-priced',()=>{
 const p=prepare();
 const r=interpretOpticOddsSgpPrice(p,providerResponse(p,{price:975}),{now:time});
 assert.equal(r.status,'CORRELATED_PROVIDER_PRICE_REFERENCE');
 assert.equal(r.targetTierMatched,false);
 assert.equal(r.observedTier,'OUTSIDE_TIER_BANDS');
});
test('missing entry, different selection, wrong fixture, errors and malformed prices never become a reference',()=>{
 const p=prepare();
 for(const response of [
  providerResponse(p,{missing_entries:[p.entries[0]]}),
  providerResponse(p,{error:'SelectionsCannotBeCombined'}),
  providerResponse(p,{legs:p.entries.slice(1)}),
  providerResponse(p,{legs:p.entries.map((e,i)=>i===1?{...e,name:'Wrong Over 64.5'}:e)}),
  providerResponse(p,{legs:p.entries.map((e,i)=>i===2?{...e,fixture_id:'different'}:e)}),
  providerResponse(p,{price:null}),providerResponse(p,{price:-110}),
  providerResponse(p,{price:'3800'})
 ]){
  const r=interpretOpticOddsSgpPrice(p,response,{now:time});
  assert.equal(r.bookQuoteVerified,false);
  assert.equal(r.correlatedPrice,null);
  assert.notEqual(r.status,'CORRELATED_PROVIDER_PRICE_REFERENCE');
 }
});
test('provider is disabled by default; unconfigured or unmapped input spends ZERO credits',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('never')};
 for(const config of [{},{OPTICODDS_SGP_ENABLED:'true'},
  {OPTICODDS_API_KEY:'sample'}]){
  const r=await requestOpticOddsSgpReference({
   plan:prepare(),env:config,fetcher,now:time
  });
  assert.equal(r.status,'PROVIDER_DISABLED_OR_UNCONFIGURED');
 }
 const r=await requestOpticOddsSgpReference({
  plan:prepare({mapping:null}),
  env:{OPTICODDS_SGP_ENABLED:'true',OPTICODDS_API_KEY:'sample'},fetcher
 });
 assert.equal(r.status,'PROVIDER_MAPPING_NOT_READY');
 assert.equal(calls,0);
});
test('opted-in provider calls once with safe request; still returns unverified sportsbook reference',async()=>{
 let count=0;
 const plan=prepare();
 const r=await requestOpticOddsSgpReference({plan,
  env:{OPTICODDS_SGP_ENABLED:'true',OPTICODDS_API_KEY:'sample-for-test'},
  fetcher:async(url,options)=>{
   count++;
   assert.equal(url,'https://api.opticodds.com/api/v3/parlay/odds');
   assert.equal(options.method,'POST');
   assert.equal(options.headers['X-Api-Key'],'sample-for-test');
   assert.deepEqual(JSON.parse(options.body),plan.requestBody);
   return{ok:true,json:async()=>providerResponse(plan)};
  },now:time});
 assert.equal(count,1);
 assert.equal(r.correlatedPrice,3800);
 assert.equal(r.bookQuoteVerified,false);
});
test('NBA optional DraftKings adapter supports mapped points/assists/rebounds but not guessed market names',()=>{
 const nbaId='401917234',entries=['points','assists','rebounds'].map((cat,i)=>({
  gameId:nbaId,playerId:String(i+1),name:'Player '+i,team:i?'LAL':'DEN',category:cat,threshold:cat==='points'?20:cat==='assists'?5:8
 }));
 const mapped={league:'nba',book:'DraftKings',espnGameId:nbaId,
  fixtureId:'nba:CONFIRMED',verifiedAt:new Date(time-10000).toISOString(),
  entries:entries.map(e=>({...e,fixture_id:'nba:CONFIRMED',
   market:'Verified '+e.category,selection:e.name+' Over '+(e.threshold-0.5)}))};
 const p=prepareOpticOddsSgpRequest({league:'nba',gameId:nbaId,risk:'Small',
  legs:entries,mapping:mapped,now:time});
 assert.equal(p.ready,true);
 assert.equal(p.requestBody.entries.length,3);
 assert.equal(interpretOpticOddsSgpPrice(p,{data:{DraftKings:{price:2200,error:null,
   missing_entries:null,legs:p.entries}}},{now:time}).bookQuoteVerified,false);
});

test('operational readiness discloses opt-in requirement without leaking API credential',()=>{
 const none=pregameReadiness({}).correlatedSgpPricing;
 assert.equal(none.status,'CREDENTIAL_NOT_CONFIGURED');
 assert.equal(none.enabled,false);
 assert.deepEqual(none.supportedReferenceBooks,['DraftKings']);
 assert.deepEqual(none.unsupportedReferenceBooks,['FanDuel']);
 const disabled=pregameReadiness({OPTICODDS_API_KEY:'test-private'}).correlatedSgpPricing;
 assert.equal(disabled.status,'DISABLED');
 const enabled=pregameReadiness({
  OPTICODDS_API_KEY:'test-private',OPTICODDS_SGP_ENABLED:'true'
 }).correlatedSgpPricing;
 assert.equal(enabled.status,'DISCOVERY_DISABLED');
 const discovery=pregameReadiness({
  OPTICODDS_API_KEY:'test-private',OPTICODDS_SGP_ENABLED:'true',
  OPTICODDS_DISCOVERY_ENABLED:'true'
 }).correlatedSgpPricing;
 assert.equal(discovery.status,'EXPLICIT_CALL_BUDGET_REQUIRED');
 const allowed=pregameReadiness({
  OPTICODDS_API_KEY:'test-private',OPTICODDS_SGP_ENABLED:'true',
  OPTICODDS_DISCOVERY_ENABLED:'true',OPTICODDS_MAX_CALLS_PER_RUN:'10'
 }).correlatedSgpPricing;
 assert.equal(allowed.status,'CONFIGURED_MAPPING_STILL_REQUIRED');
 assert.equal(allowed.budgetConfigured,true);
 assert.equal(enabled.crosswalkReady,false);
 assert.equal(enabled.providerCallsOnPublicPageLoad,false);
 assert.equal(enabled.bookIssuedSgpQuoteVerified,false);
 assert.ok(!JSON.stringify(enabled).includes('test-private'));
});

test('NFL passing/rushing/receiving alt yards must be multiples of five, but receptions may be integer',()=>{
 for(const cat of ['passing','rushing','receiving']){
  const broken=legs.map((l,i)=>i===0?{...l,cat,analyticsThreshold:177}:l);
  assert.equal(prepare({legs:broken}).reason,
   'NFL_YARDAGE_THRESHOLD_NOT_MULTIPLE_OF_FIVE',cat);
 }
 const reception=legs.map((l,i)=>i===0?{...l,cat:'receptions',analyticsThreshold:3}:l);
 const m={...mapping,entries:mapping.entries.map((e,i)=>i===0?
  {...e,cat:'receptions',analyticsThreshold:3,market:'Player Receptions',
   selection:'Trevor Lawrence Over 2.5'}:e)};
 const result=prepare({legs:reception,mapping:m});
 assert.equal(result.ready,true);
});

test('OpticOdds rejected SGP combinations, suspended legs, and outage errors are distinct',()=>{
 const plan=prepare();
 const rejected=interpretOpticOddsSgpPrice(plan,{
  DraftKings:{error:'SelectionsCannotBeCombined'}},{now:time});
 assert.equal(rejected.status,'PROVIDER_SGP_COMBINATION_REJECTED');
 assert.equal(rejected.correlatedPrice,null);
 const suspended=interpretOpticOddsSgpPrice(plan,{
  data:{DraftKings:{error:'Missing odds for entries.',
   missing_entries:[plan.entries[1]],price:null}}},{now:time});
 assert.equal(suspended.status,'PROVIDER_SGP_MISSING_ENTRIES');
 const down=interpretOpticOddsSgpPrice(plan,{
  data:{DraftKings:{error:'Error with response. Try again later.',price:null}}},{now:time});
 assert.equal(down.status,'PROVIDER_SGP_PRICING_ERROR');
 for(const v of [rejected,suspended,down])assert.equal(v.bookQuoteVerified,false);
});
