import test from 'node:test';
import assert from 'node:assert/strict';
import {manualAiRefresh} from '../lib/manual-ai-refresh.js';
const make=(sport='NFL',gameId='g1',actorId='u1')=>({
 sport,gameId,actorId,now:100000,
 loadCached:async()=>({sport,gameId,updatedAt:'2026-10-15T00:00:00Z',players:[{id:'p1',active:true,starter:true,status:'ACTIVE'},{id:'p2',active:false,status:'OUT'}]}),
 runAnalysis:async()=>({legs:[{playerId:'p1',market:'rushing_yards',threshold:75},{playerId:'p1',market:'rushing_yards',threshold:77},{playerId:'p2',market:'receptions',threshold:3}]}),
 validateMarket:async()=>({available:true,oddsVerified:true,sourceTimestamp:'2026-10-15T00:00:00Z'})
});
test('NFL refresh uses cache and holds invalid legs',async()=>{const r=await manualAiRefresh(make());assert.equal(r.paidSportsApiCalls,0);assert.equal(r.accepted.length,1);assert.equal(r.held.length,2);assert.equal(r.publicationBlocked,true)});
test('NBA refresh is supported',async()=>{const r=await manualAiRefresh(make('NBA','g2','u2'));assert.equal(r.status,'review_required')});
test('cooldown blocks repeat',async()=>{const a=make('NFL','g3','u3');await manualAiRefresh(a);const r=await manualAiRefresh(a);assert.equal(r.status,'cooldown')});
test('unverified market cannot be published',async()=>{const a=make('NBA','g4','u4');a.validateMarket=async()=>({available:false});const r=await manualAiRefresh(a);assert.equal(r.accepted.length,0)});

import {refreshFullSlate} from '../lib/manual-ai-refresh.js';

test('full slate refresh rechecks each game and rebuilds four tiers',async()=>{
 const seen=[],published=[];
 const result=await refreshFullSlate({sport:'NFL',actorId:'test',now:Date.parse('2026-11-12T20:05:00Z'),
  listGames:async()=>[{gameId:'1234567'},{gameId:'7654321'}],
  fetchOfficialEvidence:async({game,force,cache})=>{
   seen.push(['evidence',game.gameId,force,cache]);
   return{gameId:game.gameId,verified:true,injuriesCheckedAt:'2026-11-12T20:00:00Z',
    startersCheckedAt:'2026-11-12T20:00:00Z'};},
  rebuildGame:async({game,tiers})=>{seen.push(['rebuild',game.gameId,...tiers]);return{tiers};},
  validateGame:async()=>({ok:true,allFourTiersVerified:true}),
  publishGame:async({game})=>published.push(game.gameId)});
 assert.equal(result.published,2);
 assert.deepEqual(published,['1234567','7654321']);
 assert.equal(seen.filter(x=>x[0]==='evidence').length,2);
 assert.ok(seen.some(x=>x.includes('Large')));
});
test('full slate refresh refuses stale or unverified injury and starter evidence',async()=>{
 let rebuilds=0,publishes=0;
 const result=await refreshFullSlate({sport:'NFL',actorId:'test',now:Date.parse('2026-11-12T20:05:00Z'),
  listGames:async()=>[{gameId:'1234567'}],
  fetchOfficialEvidence:async()=>({gameId:'1234567',verified:false}),
  rebuildGame:async()=>{rebuilds++;return{};},
  validateGame:async()=>({ok:true,allFourTiersVerified:true}),
  publishGame:async()=>{publishes++;}});
 assert.equal(result.held,1);
 assert.equal(rebuilds,0);
 assert.equal(publishes,0);
});
test('full slate refresh never publishes a partially validated four-tier rebuild',async()=>{
 let publishes=0;
 const result=await refreshFullSlate({sport:'NBA',actorId:'test',now:Date.parse('2026-11-12T20:05:00Z'),
  listGames:async()=>[{gameId:'1234567'}],
  fetchOfficialEvidence:async()=>({gameId:'1234567',verified:true,
   injuriesCheckedAt:'2026-11-12T20:00:00Z',startersCheckedAt:'2026-11-12T20:00:00Z'}),
  rebuildGame:async()=>({}),
  validateGame:async()=>({ok:true,allFourTiersVerified:false}),
  publishGame:async()=>{publishes++;}});
 assert.equal(result.held,1);
 assert.equal(publishes,0);
});
