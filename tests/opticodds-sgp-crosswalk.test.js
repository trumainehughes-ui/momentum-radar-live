import test from 'node:test';
import assert from 'node:assert/strict';
import {matchOpticOddsFixture,buildOpticOddsMarketCrosswalk,verifyOpticOddsMarketCatalog,
 verifyOpticOddsPlayerRosters}
 from '../lib/opticodds-sgp-crosswalk.js';
import {prepareOpticOddsSgpRequest} from '../lib/opticodds-sgp-reference.js';
const now=Date.parse('2026-10-11T10:00:00Z');
const kickoff='2026-10-11T13:30:00Z',gameId='401872981',fixtureId='OPTIC-PHI-JAX-1';
const game={gameId,kickoff,home:{abbr:'JAX'},away:{abbr:'PHI'}};
const fixture={
 id:fixtureId,league:{id:'nfl'},sport:{id:'football'},
 status:'unplayed',is_live:false,start_date:kickoff,
 home_competitors:[{id:'O-JAX',abbreviation:'JAX',name:'Jacksonville Jaguars'}],
 away_competitors:[{id:'O-PHI',abbreviation:'PHI',name:'Philadelphia Eagles'}]
};
const source={data:[fixture],page:1,has_more:false};
const legs=[
 {name:'Trevor Lawrence',playerID:'11',team:'JAX',eventID:gameId,cat:'passing',analyticsThreshold:180},
 {name:'Bhayshul Tuten',playerID:'22',team:'JAX',eventID:gameId,cat:'rushing',analyticsThreshold:65},
 {name:'Parker Washington',playerID:'33',team:'JAX',eventID:gameId,cat:'receiving',analyticsThreshold:60},
 {name:'Chris Rodriguez Jr.',playerID:'44',team:'JAX',eventID:gameId,cat:'rushing',analyticsThreshold:20},
 {name:'Brenton Strange',playerID:'55',team:'JAX',eventID:gameId,cat:'receiving',analyticsThreshold:30}
];
const markets=['Player Passing Yards','Player Rushing Yards','Player Receiving Yards'];
const catalog={league:'nfl',sourceVerified:true,checkedAt:new Date(now-60000).toISOString(),
 passing:[markets[0]],rushing:[markets[1]],receiving:[markets[2]]};
const odds=legs.map((l,i)=>({
 id:'BOOK-LINE-'+i,player_id:'OPTIC-PLAYER-'+i,team_id:'O-JAX',
 sportsbook:'DraftKings',market:markets[i===0?0:i===1||i===3?1:2],
 name:l.name+' Over '+(l.analyticsThreshold-0.5),price:-115,
 timestamp:(now-30000)/1000
}));
const oddsSnapshot={data:[{...fixture,odds}]};
const playerRows=legs.map((l,i)=>({
 id:'OPTIC-PLAYER-'+i,name:l.name,is_active:true,
 team:{id:'O-JAX'},league:{id:'nfl'},sport:{id:'football'}
}));
const teamPages={
 JAX:[{data:playerRows,page:1,has_more:false}],
 PHI:[{data:[],page:1,has_more:false}]
};
const playerCrosswalk=()=>verifyOpticOddsPlayerRosters({
 league:'nfl',fixture:match(),legs,teamPages,now
});
const match=(overrides={})=>matchOpticOddsFixture({league:'nfl',game,
 fixtures:source,now,...overrides});
const build=(opts={})=>{
 const f=match();
 return buildOpticOddsMarketCrosswalk({fixture:f,league:'nfl',game,legs,
  oddsSnapshot,marketCatalog:catalog,playerCrosswalk:playerCrosswalk(),now,...opts});
};
test('exact away/home and kickoff yields a single provider fixture mapping',()=>{
 const x=match();
 assert.equal(x.ready,true);
 assert.equal(x.fixtureId,fixtureId);
 assert.equal(x.homeTeamId,'O-JAX');
 assert.equal(x.espnGameId,gameId);
 assert.equal(x.source.includes('/fixtures/active'),true);
});
test('wrong teams, swapped venues, kickoff mismatch, wrong sport, incomplete pages, duplicates fail closed',()=>{
 for(const overrides of [
  {fixtures:{data:[{...fixture,home_competitors:fixture.away_competitors,away_competitors:fixture.home_competitors}]}},
  {fixtures:{data:[{...fixture,start_date:'2026-10-11T14:05:00Z'}]}},
  {fixtures:{data:[{...fixture,league:{id:'nba'}}]}},
  {fixtures:{data:[{...fixture,status:'completed'}]}},
  {fixtures:{data:[fixture,fixture]}},
  {fixtures:{data:[fixture],has_more:true}},
  {game:{...game,kickoff:'bad'}},
  {game:{...game,home:{abbr:'PHI'}}}
 ]){
  const x=match(overrides);
  assert.equal(x.ready,false,JSON.stringify(overrides).slice(0,160));
 }
});
test('fresh DraftKings + correct provider player, team, exact yard line gives provider crosswalk',()=>{
 const x=build();
 assert.equal(x.ready,true);
 assert.equal(x.entries.length,5);
 assert.equal(x.entries[0].providerPlayerId,'OPTIC-PLAYER-0');
 const plan=prepareOpticOddsSgpRequest({league:'nfl',gameId,risk:'Medium',
  book:'DraftKings',legs,mapping:{
   ...x,espnGameId:gameId,
  },now});
 assert.equal(plan.ready,true);
 assert.deepEqual(plan.requestBody.entries[0],{
  fixture_id:fixtureId,market:'Player Passing Yards',
  name:'Trevor Lawrence Over 179.5'});
});
test('mispriced lines, wrong reported team ID, wrong book, duplicate markets and stale odds cannot map',()=>{
 const tests=[
  [{...odds[1],name:'Bhayshul Tuten Over 65.5'},'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE'],
  [{...odds[1],team_id:'O-PHI'},'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE'],
  [{...odds[1],sportsbook:'FanDuel'},'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE'],
  [{...odds[1],timestamp:(now-16*60000)/1000},'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE'],
  [{...odds[1],price:null},'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE'],
  [null,'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE']
 ];
 for(const [update,expected] of tests){
  const changed=odds.map((o,i)=>i!==1?o:update).filter(Boolean);
  const x=build({oddsSnapshot:{data:[{...fixture,odds:changed}]}});
  assert.equal(x.ready,false);
  assert.equal(x.reason,expected);
 }
 const doubled=build({oddsSnapshot:{data:[{...fixture,odds:[...odds,odds[1]]}]}});
 assert.equal(doubled.reason,'AMBIGUOUS_PROVIDER_PLAYER_MARKET');
});
test('no catalog verification, provider identity mismatch, old fixture and provider game mismatch refuse to manufacture mappings',()=>{
 const checks=[
  {marketCatalog:{...catalog,sourceVerified:false}},
  {marketCatalog:{...catalog,checkedAt:new Date(now-25*3600000).toISOString()}},
  {marketCatalog:{...catalog,rushing:['Fake Price Market']}},
  {oddsSnapshot:{data:[{...fixture,id:'ANOTHER-ID',odds}]}},
  {oddsSnapshot:{data:[{...fixture,home_competitors:[{id:'wrong',abbreviation:'JAX'}],odds}]}},
  {oddsSnapshot:{data:[{...fixture,odds}, {...fixture,odds}]}},
  {fixture:{...match(),verifiedAt:new Date(now-16*60000).toISOString()}}
 ];
 for(const patch of checks)assert.equal(build(patch).ready,false,JSON.stringify(patch).slice(0,120));
});
test('NBA game with exact fixture and four categories uses the same market matching pathway',()=>{
 const basketballGame='401917234',nbaTip='2026-10-25T01:00:00Z';
 const g={gameId:basketballGame,kickoff:nbaTip,home:{abbr:'DEN'},away:{abbr:'LAL'}};
 const fx={...fixture,id:'O-NBA',sport:{id:'basketball'},league:{id:'nba'},
  start_date:nbaTip,
  home_competitors:[{id:'O-DEN',abbreviation:'DEN'}],
  away_competitors:[{id:'O-LAL',abbreviation:'LAL'}]};
 const f=matchOpticOddsFixture({league:'nba',game:g,
  fixtures:{data:[fx]},now});
 assert.equal(f.ready,true);
 const nbaLegs=[
  {gameId:basketballGame,playerId:'11',name:'Player A',team:'DEN',category:'points',threshold:20},
  {gameId:basketballGame,playerId:'22',name:'Player B',team:'LAL',category:'assists',threshold:5}
 ];
 const nbaTeamPages={
  DEN:[{page:1,has_more:false,data:[{
   id:'O-1',name:'Player A',is_active:true,team:{id:'O-DEN'},
   league:{id:'nba'},sport:{id:'basketball'}
  }]}],
  LAL:[{page:1,has_more:false,data:[{
   id:'O-2',name:'Player B',is_active:true,team:{id:'O-LAL'},
   league:{id:'nba'},sport:{id:'basketball'}
  }]}]
 };
 const nbaCrosswalk=verifyOpticOddsPlayerRosters({
  league:'nba',fixture:f,legs:nbaLegs,teamPages:nbaTeamPages,now
 });
 assert.equal(nbaCrosswalk.ready,true);
 const b=buildOpticOddsMarketCrosswalk({fixture:f,game:g,league:'nba',legs:nbaLegs,
  playerCrosswalk:nbaCrosswalk,
  marketCatalog:{league:'nba',sourceVerified:true,checkedAt:new Date(now).toISOString(),
   points:['Player Points'],assists:['Player Assists']},
  oddsSnapshot:{data:[{...fx,odds:[
   {id:'1',player_id:'O-1',team_id:'O-DEN',sportsbook:'DraftKings',
    market:'Player Points',name:'Player A Over 19.5',price:-110,timestamp:now/1000},
   {id:'2',player_id:'O-2',team_id:'O-LAL',sportsbook:'DraftKings',
    market:'Player Assists',name:'Player B Over 4.5',price:-110,timestamp:now/1000}
  ]}]},now});
 assert.equal(b.ready,true);
});

test('market catalog is derived only from documented provider market discovery for league and DraftKings',()=>{
 const fixtureMarketNames=['Player Passing Yards','Player Rushing Yards','Player Receiving Yards'];
 const result=verifyOpticOddsMarketCatalog({league:'nfl',now,
  categoryNames:{passing:[fixtureMarketNames[0]],rushing:[fixtureMarketNames[1]],
   receiving:[fixtureMarketNames[2]],td:['Wrong TD Market']},
  providerMarkets:{data:fixtureMarketNames.map(name=>({name,
   sports:[{id:'football',leagues:[{id:'nfl',
    sportsbooks:[{id:'draftkings',name:'DraftKings'}]}]}]}))}});
 assert.equal(result.sourceVerified,true);
 assert.deepEqual(result.passing,['Player Passing Yards']);
 assert.deepEqual(result.rushing,['Player Rushing Yards']);
 assert.deepEqual(result.receiving,['Player Receiving Yards']);
 assert.deepEqual(result.td,[]);
 const mapped=build({marketCatalog:result});
 assert.equal(mapped.ready,true);
});
test('market catalog must not borrow market names from a different league or sportsbook',()=>{
 const options={league:'nfl',now,categoryNames:{passing:['Player Passing Yards']}};
 const wrongLeague=verifyOpticOddsMarketCatalog({...options,providerMarkets:{data:[{
  name:'Player Passing Yards',sports:[{id:'football',leagues:[{id:'ncaaf',
   sportsbooks:[{id:'draftkings'}]}]}]}]}});
 assert.equal(wrongLeague.sourceVerified,false);
 const wrongBook=verifyOpticOddsMarketCatalog({...options,providerMarkets:{data:[{
  name:'Player Passing Yards',sports:[{id:'football',leagues:[{id:'nfl',
   sportsbooks:[{id:'fanduel'}]}]}]}]}});
 assert.equal(wrongBook.sourceVerified,false);
});

test('documented DraftKings player-prop odds with empty team_id still match through roster player_id',()=>{
 const x=build({oddsSnapshot:{data:[{...fixture,odds:odds.map(x=>({...x,team_id:''}))}]}});
 assert.equal(x.ready,true);
 assert.equal(x.entries.length,legs.length);
});
test('missing or ambiguous provider player rosters stop mapping before any pricing attempt',()=>{
 assert.equal(build({playerCrosswalk:null}).reason,'PROVIDER_PLAYER_ROSTER_CROSSWALK_REQUIRED');
 const duplicate=verifyOpticOddsPlayerRosters({league:'nfl',fixture:match(),legs,
  teamPages:{...teamPages,JAX:[{page:1,has_more:false,data:[playerRows[0],{...playerRows[0],id:'other'},...playerRows.slice(1)]}]},now});
 assert.equal(duplicate.reason,'AMBIGUOUS_PROVIDER_ROSTER_PLAYER');
 const wrongTeam=verifyOpticOddsPlayerRosters({league:'nfl',fixture:match(),legs,
  teamPages:{...teamPages,JAX:[{page:1,has_more:false,data:playerRows.map((p,i)=>i===0?{...p,team:{id:'O-PHI'}}:p)}]},now});
 assert.equal(wrongTeam.reason,'PLAYER_NOT_ON_VERIFIED_PROVIDER_TEAM');
 const wrongId=build({playerCrosswalk:{...playerCrosswalk(),
  entries:playerCrosswalk().entries.map((x,i)=>i===1?{...x,opticPlayerId:'wrong'}:x)}});
 assert.equal(wrongId.reason,'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE');
});

test('same verified quarterback can provide two DISTINCT stats within one SGP',()=>{
 const second={...legs[0],cat:'rushing',analyticsThreshold:20};
 const withTwo=[...legs,second];
 const verified=verifyOpticOddsPlayerRosters({
  league:'nfl',fixture:match(),legs:withTwo,teamPages,now
 });
 assert.equal(verified.ready,true);
 assert.equal(verified.entries.length,5,'one identity mapping per player, not per prop');
 const withTwoOdds=[...odds,{...odds[0],id:'BOOK-QB-RUSHING',
  market:'Player Rushing Yards',name:'Trevor Lawrence Over 19.5'}];
 const built=buildOpticOddsMarketCrosswalk({
  fixture:match(),game,league:'nfl',legs:withTwo,
  oddsSnapshot:{data:[{...fixture,odds:withTwoOdds}]},
  marketCatalog:catalog,playerCrosswalk:verified,now
 });
 assert.equal(built.ready,true);
 assert.equal(built.entries.length,6);
 const plan=prepareOpticOddsSgpRequest({
  league:'nfl',gameId,risk:'Nuke',book:'DraftKings',legs:withTwo,
  mapping:{...built,espnGameId:gameId},now
 });
 assert.equal(plan.ready,true);
 assert.equal(plan.requestBody.entries.length,6);
});
