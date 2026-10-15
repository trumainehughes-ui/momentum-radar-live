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
