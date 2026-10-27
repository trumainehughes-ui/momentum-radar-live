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
