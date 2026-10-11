import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverOpticOddsSgpReference} from '../lib/opticodds-sgp-pipeline.js';

const now=Date.parse('2026-10-11T10:00:00Z');
const game={gameId:'401872981',kickoff:'2026-10-11T13:30:00Z',
 home:{abbr:'JAX'},away:{abbr:'PHI'}};
const fixture={id:'OPTIC-NFL-1',status:'unplayed',is_live:false,
 start_date:game.kickoff,sport:{id:'football'},league:{id:'nfl'},
 home_competitors:[{id:'O-JAX',abbreviation:'JAX'}],
 away_competitors:[{id:'O-PHI',abbreviation:'PHI'}]};
const legs=[
 {eventID:game.gameId,playerID:'11',name:'Trevor Lawrence',team:'JAX',cat:'passing',analyticsThreshold:180},
 {eventID:game.gameId,playerID:'22',name:'Bhayshul Tuten',team:'JAX',cat:'rushing',analyticsThreshold:65},
 {eventID:game.gameId,playerID:'33',name:'Parker Washington',team:'JAX',cat:'receiving',analyticsThreshold:60},
 {eventID:game.gameId,playerID:'44',name:'Chris Rodriguez Jr.',team:'JAX',cat:'rushing',analyticsThreshold:20},
 {eventID:game.gameId,playerID:'55',name:'Brenton Strange',team:'JAX',cat:'receiving',analyticsThreshold:30}
];
const namesByCat={passing:['Player Passing Yards'],rushing:['Player Rushing Yards'],
 receiving:['Player Receiving Yards']};
const sourceMarkets=Object.values(namesByCat).flat().map(name=>({
 id:name==='Player Passing Yards'?'player_passing_yards':
  name==='Player Rushing Yards'?'player_rushing_yards':'player_receiving_yards',
 name,sports:[{id:'football',leagues:[{id:'nfl',
  sportsbooks:[{id:'draftkings',name:'DraftKings'}]}]}]
}));
const odds=legs.map((l,i)=>({id:'odds-'+i,player_id:'o-player-'+i,
 team_id:'',sportsbook:'DraftKings',price:-115,
 market:namesByCat[l.cat][0],name:l.name+' Over '+(l.analyticsThreshold-0.5),
 timestamp:now/1000}));
const flags={OPTICODDS_SGP_ENABLED:'true',
 OPTICODDS_DISCOVERY_ENABLED:'true',OPTICODDS_API_KEY:'fixture-only-test',
 OPTICODDS_MAX_CALLS_PER_RUN:'10'};
function setup({badOdds=null,badPage=false,badRoster=false,rateLimited=false}={}){
 let calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method,options});
  if(rateLimited)return{status:429,ok:false};
  if(options.method==='POST'){
   const req=JSON.parse(options.body);
   assert.deepEqual(req.sportsbooks,['DraftKings']);
   return{ok:true,json:async()=>({data:{DraftKings:{
    error:null,missing_entries:null,price:4300,
    legs:req.entries.map(x=>({...x,price:-115}))
   }}})};
  }
  const path=new URL(url);
  const response=path.pathname.endsWith('/markets')?{data:sourceMarkets}:
   path.pathname.endsWith('/fixtures/active')?
    {data:path.searchParams.get('page')==='1'?[fixture]:[],
     page:Number(path.searchParams.get('page')),
     has_more:badPage?'yes':path.searchParams.get('page')==='1'}:
   path.pathname.endsWith('/players')?
    {data:path.searchParams.get('team_id')==='O-JAX'?
      legs.map((l,i)=>({
       id:'o-player-'+i,name:badRoster&&i===1?'Wrong Player':l.name,
       team:{id:'O-JAX'},league:{id:'nfl'},
       sport:{id:'football'},is_active:true
      })):[],page:Number(path.searchParams.get('page')),has_more:false}:
   path.pathname.endsWith('/fixtures/odds')?
    {data:[{...fixture,odds:badOdds||odds}]}:{data:[]};
  return{ok:true,json:async()=>response};
 };
 return{fetcher,calls};
}
test('disabled API performs no discovery requests even if model candidates exist',async()=>{
 const {fetcher,calls}=setup();
 for(const env of [{},{OPTICODDS_API_KEY:'key'},
  {OPTICODDS_SGP_ENABLED:'true',OPTICODDS_API_KEY:'key'}]){
  const result=await discoverOpticOddsSgpReference({league:'nfl',game,
   legs,risk:'Medium',categoryMarketNames:namesByCat,env,fetcher,now});
  assert.equal(result.status,'OPTICODDS_DISCOVERY_DISABLED');
  assert.equal(result.requests,0);
 }
 assert.equal(calls.length,0);
});
test('two page NFL discovery, markets and exact odds produce only a reference, not a verified book ticket',async()=>{
 const {fetcher,calls}=setup();
 const result=await discoverOpticOddsSgpReference({league:'nfl',
  game,legs,risk:'Medium',categoryMarketNames:namesByCat,env:flags,fetcher,now});
 assert.equal(result.status,'CORRELATED_PROVIDER_PRICE_REFERENCE');
 assert.equal(result.correlatedPrice,4300);
 assert.equal(result.observedTier,'Medium');
 assert.equal(result.targetTierMatched,true);
 assert.equal(result.bookQuoteVerified,false);
 assert.equal(result.ready,true);
 assert.equal(result.requests,7);
 assert.equal(calls.length,7);
 assert.deepEqual(calls.map(c=>c.method),['GET','GET','GET','GET','GET','GET','POST']);
 assert.equal(calls.filter(c=>c.url.includes('/players?')).length,2);
 assert.ok(calls.filter(c=>c.url.includes('/fixtures/active?'))
  .every(c=>c.url.includes('start_date_after')&&c.url.includes('start_date_before')));
 assert.ok(calls.every(c=>c.options.headers['X-Api-Key']==='fixture-only-test'));
 assert.ok(!JSON.stringify(result).includes('fixture-only-test'));
});
test('over 65.5 does not equal model 65+: no SGP quote request attempted',async()=>{
 const wrong=odds.map((x,i)=>i===1?{...x,name:'Bhayshul Tuten Over 65.5'}:x);
 const {fetcher,calls}=setup({badOdds:wrong});
 const result=await discoverOpticOddsSgpReference({league:'nfl',game,legs,
  risk:'Medium',categoryMarketNames:namesByCat,env:flags,fetcher,now});
 assert.equal(result.ready,false);
 assert.equal(result.status,'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE');
 assert.equal(result.requests,6);
 assert.ok(calls.every(x=>x.method==='GET'));
});
test('fixture paging quota and API 429 fail closed before any quote',async()=>{
 const excessive=setup({badPage:true});
 const a=await discoverOpticOddsSgpReference({league:'nfl',
  game,legs,risk:'Medium',categoryMarketNames:namesByCat,
  env:flags,fetcher:excessive.fetcher,now});
 assert.equal(a.status,'PROVIDER_FIXTURE_PAGINATION_INCOMPLETE');
 assert.equal(a.requests,2);
 const tooMany=setup({rateLimited:true});
 const b=await discoverOpticOddsSgpReference({league:'nfl',
  game,legs,risk:'Medium',categoryMarketNames:namesByCat,
  env:flags,fetcher:tooMany.fetcher,now});
 assert.equal(b.status,'PROVIDER_RATE_LIMITED');
 assert.equal(b.requests,1);
});

test('wrong OpticOdds roster player name stops before /fixtures/odds or combined pricing',async()=>{
 const {fetcher,calls}=setup({badRoster:true});
 const result=await discoverOpticOddsSgpReference({league:'nfl',game,
  legs,risk:'Medium',categoryMarketNames:namesByCat,env:flags,fetcher,now});
 assert.equal(result.ready,false);
 assert.equal(result.status,'PLAYER_NOT_ON_VERIFIED_PROVIDER_TEAM');
 assert.ok(calls.every(x=>x.method==='GET'));
 assert.equal(calls.filter(c=>c.url.includes('/fixtures/odds')).length,0);
});

test('provider costs are capped, including avoiding a final POST when the request budget is exhausted',async()=>{
 const insufficient=setup();
 const output=await discoverOpticOddsSgpReference({league:'nfl',
  game,legs,risk:'Medium',categoryMarketNames:namesByCat,
  env:{...flags,OPTICODDS_MAX_CALLS_PER_RUN:'6'},
  fetcher:insufficient.fetcher,now});
 assert.equal(output.status,'PROVIDER_REQUEST_BUDGET_EXCEEDED');
 assert.equal(output.requests,6);
 assert.equal(insufficient.calls.length,6);
 assert.ok(insufficient.calls.every(x=>x.method==='GET'));
 const noBudget=setup();
 const pending=await discoverOpticOddsSgpReference({league:'nfl',
  game,legs,risk:'Medium',categoryMarketNames:namesByCat,
  env:{...flags,OPTICODDS_MAX_CALLS_PER_RUN:undefined},
  fetcher:noBudget.fetcher,now});
 assert.equal(pending.status,'EXPLICIT_PROVIDER_CALL_BUDGET_REQUIRED');
 assert.equal(pending.requests,0);
 assert.equal(noBudget.calls.length,0);
});
