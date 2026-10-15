import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeManualSnapshot} from '../lib/manual-refresh-summary.js';
test('NFL summary is read-only and zero sports API calls',()=>{
 const r=summarizeManualSnapshot({sport:'NFL',gameId:'401234567',snapshot:{gameId:'401234567',checkedAt:new Date().toISOString(),sgps:[{risk:'Small',status:'MODEL_ONLY',legs:[{}]}]}});
 assert.equal(r.paidSportsApiCalls,0);assert.equal(r.publicationBlocked,true);assert.equal(r.aiReanalysisPerformed,false);assert.equal(r.tiers[0].legCount,1);
});
test('NBA summary does not invent tiers',()=>{const r=summarizeManualSnapshot({sport:'NBA',gameId:'401234568',snapshot:{gameId:'401234568'}});assert.deepEqual(r.tiers,[]);assert.equal(r.stale,true)});
test('snapshot identity mismatch is rejected',()=>assert.throws(()=>summarizeManualSnapshot({sport:'NFL',gameId:'401234567',snapshot:{gameId:'401234568'}}),/mismatch/));
test('invalid game ids are rejected',()=>assert.throws(()=>summarizeManualSnapshot({sport:'NBA',gameId:'oops',snapshot:{}}),/invalid_game/));

test('snapshot without a game identity is rejected',()=>assert.throws(()=>summarizeManualSnapshot({sport:'NBA',gameId:'401234568',snapshot:{}}),/snapshot_identity_mismatch/));
