import test from 'node:test';
import assert from 'node:assert/strict';
import {nbaBestEdgeParlay} from '../lib/nba-best-edge-parlay.js';

test('NBA Edge Hunter rejects unsupported model-only mode',()=>{
 const result=nbaBestEdgeParlay([],{mode:'MODEL_ONLY'});
 assert.equal(result.status,'NO_QUALIFYING_PARLAY');
 assert.equal(result.reason,'VERIFIED_MARKET_REQUIRED');
 assert.deepEqual(result.legs,[]);
});

test('NBA Edge Hunter cannot publish a four-leg parlay without verified starters',()=>{
 const now=Date.now();
 const games=[1,2].map((i)=>({gameId:String(i),status:'SCHEDULED',kickoff:new Date(now+3600000).toISOString(),total:230,spread:2,playerProjections:[{playerId:String(i),name:'Example Player',team:'ABC',category:'points',starterVerified:false,projection:25,historicalValues:Array(10).fill(30)}]}));
 const result=nbaBestEdgeParlay(games,{now});
 assert.equal(result.status,'NO_QUALIFYING_PARLAY');
 assert.equal(result.reason,'NO_CONFIRMED_GAME_STARTERS');
 assert.deepEqual(result.legs,[]);
});


test('NBA Edge Hunter rejects fabricated markets even with starter and history flags',()=>{
 const now=Date.now();
 const games=[1,2].map(i=>({gameId:String(i),status:'SCHEDULED',kickoff:new Date(now+3600000).toISOString(),total:230,spread:2,playerProjections:[{playerId:String(i),name:'Example Player',team:'ABC',category:'points',starterVerified:true,projection:25,historicalValues:Array(10).fill(30),verifiedMarkets:[{book:'DraftKings',line:20,side:'UNDER',available:true,verifiedByServer:false}]}]}));
 const result=nbaBestEdgeParlay(games,{now});
 assert.equal(result.status,'NO_QUALIFYING_PARLAY');
 assert.deepEqual(result.legs,[]);
 assert.ok(result.diagnostics.marketRejected>0);
});


test('NBA Edge Hunter refuses scheduled games with no player projections',()=>{
 const now=Date.now();
 const games=[1,2].map(i=>({gameId:String(i),status:'SCHEDULED',kickoff:new Date(now+3600000).toISOString(),total:240,spread:1,playerProjections:[]}));
 const result=nbaBestEdgeParlay(games,{now});
 assert.equal(result.status,'NO_QUALIFYING_PARLAY');
 assert.equal(result.reason,'FEWER_THAN_TWO_COMPETITIVE_HIGH_TOTAL_GAMES');
 assert.deepEqual(result.legs,[]);
});


test('NBA Edge Hunter does not skip blank entries in the latest ten box scores',()=>{
 const now=Date.now();
 const games=[1,2].map(i=>({gameId:String(i),status:'SCHEDULED',kickoff:new Date(now+3600000).toISOString(),total:240,spread:1,playerProjections:[{playerId:String(i),name:'Example Player',team:'ABC',category:'points',starterVerified:true,projection:30,historicalValues:[28,'   ',...Array(9).fill(28)]}]}));
 const result=nbaBestEdgeParlay(games,{now});
 assert.equal(result.status,'NO_QUALIFYING_PARLAY');
 assert.equal(result.diagnostics.historyRejected,2);
 assert.equal(result.diagnostics.marketRejected,0);
 assert.deepEqual(result.legs,[]);
});


test('shared NBA market gate accepts verified two-digit odds only for matching team',async()=>{
 const {evaluateUniversalPlayerMarketGate}=await import('../lib/sport-sgp-verification-gate.js');
 const now=Date.now(),checkedAt=new Date(now-60_000).toISOString();
 const leg={playerId:'athlete-1',gameId:'game-1',team:'BOS',category:'points'};
 const role={recommendationEligible:true,playerId:'athlete-1',team:'BOS',starterStatus:'CONFIRMED_STARTER',starterVerified:true,
  verification:{role:{verified:true,checkedAt},availability:{verified:true,checkedAt,officialInactivesVerified:true}}};
 const offers=['DraftKings','FanDuel'].map((book,i)=>({book,sport:'nba',gameId:'game-1',playerId:'athlete-1',team:'BOS',market:'points',side:'OVER',offerId:'offer-'+i,americanOdds:'-95',line:20.5,checkedAt,available:true,verifiedByServer:true,
  sourceUrl:i?'https://sportsbook.fanduel.com/basketball':'https://sportsbook.draftkings.com/leagues/basketball/nba'}));
 assert.equal(evaluateUniversalPlayerMarketGate({sport:'nba',gameId:'game-1',leg,role,offers,now}).ready,true);
 assert.equal(evaluateUniversalPlayerMarketGate({sport:'nba',gameId:'game-1',leg,role,offers:offers.map(o=>({...o,team:''})),now}).ready,false);
});


test('ESPN summary fallback requires matching event and five explicit starters per team',async()=>{
 const {parseEspnSummaryStarters}=await import('../lib/espn-event-starter-evidence.js');
 const makeRows=(start)=>Array.from({length:5},(_,i)=>({athlete:{id:String(start+i)},starter:true}));
 const summary={header:{id:'401909877',competitions:[{competitors:[
  {team:{id:'2',abbreviation:'BOS'}},{team:{id:'17',abbreviation:'BKN'}}]}]},
  boxscore:{players:[{team:{id:'2'},statistics:[{athletes:makeRows(100)}]},
   {team:{id:'17'},statistics:[{athletes:makeRows(200)}]}]}};
 const opts={gameId:'401909877',checkedAt:new Date().toISOString()};
 assert.equal(parseEspnSummaryStarters(summary,opts).startersConfirmed,true);
 assert.equal(parseEspnSummaryStarters(summary,{...opts,gameId:'401909878'}).startersConfirmed,false);
 summary.boxscore.players[0].statistics[0].athletes[0].starter=false;
 assert.equal(parseEspnSummaryStarters(summary,opts).startersConfirmed,false);
});
