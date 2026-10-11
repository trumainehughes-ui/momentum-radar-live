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
 name,sports:[{id:'football',leagues:[{id:'nfl',
  sportsbooks:[{id:'draftkings',name:'DraftKings'}]}]}]
}));
const odds=legs.map((l,i)=>({id:'odds-'+i,player_id:'o-player-'+i,
 team_id:'O-JAX',sportsbook:'DraftKings',price:-115,
 market:namesByCat[l.cat][0],name:l.name+' Over '+(l.analyticsThreshold-0.5),
 timestamp:now/1000}));
const flags={OPTICODDS_SGP_ENABLED:'true',
 OPTICODDS_DISCOVERY_ENABLED:'true',OPTICODDS_API_KEY:'fixture-only-test'};
function setup({badOdds=null,badPage=false,rateLimited=false}={}){
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
     total_pages:badPage?8:2}:
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
 assert.equal(result.requests,5);
 assert.equal(calls.length,5);
 assert.deepEqual(calls.map(c=>c.method),['GET','GET','GET','GET','POST']);
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
 assert.equal(result.requests,4);
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
