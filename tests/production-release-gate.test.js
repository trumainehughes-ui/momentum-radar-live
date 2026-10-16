import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCollectorReleaseGate} from '../lib/production-release-gate.js';
const healthy={ok:true,summary:{incompleteShards:0,staleShards:0},shards:[0,1].map(shard=>({shard,status:'COMPLETE',due:2,attempted:2,failed:0,coverage:{full:2,partial:0,none:0,unverified:0}}))};
test('healthy collector model audits alone cannot authorize production',()=>{
 const r=evaluateCollectorReleaseGate(healthy,healthy);
 assert.equal(r.ready,false);
 assert.deepEqual(r.issues,['NFL_AND_NBA:COMBINED_SPORTSBOOK_QUOTES_NOT_ATTESTED']);
});
test('missing, stale and failed collector audits remain blocked',()=>{
 const bad={...healthy,summary:{incompleteShards:1,staleShards:1},shards:[{...healthy.shards[0],status:'STALE',failed:1,attempted:1,coverage:{partial:1,unverified:1}},healthy.shards[1]]};
 const r=evaluateCollectorReleaseGate(null,bad);
 assert.ok(r.issues.includes('nfl:AUDIT_UNAVAILABLE'));
 assert.ok(r.issues.includes('nba:INCOMPLETE_OR_STALE_SHARDS'));
 assert.ok(r.issues.includes('nba:UNPROCESSED_OR_FAILED_GAMES'));
 assert.ok(r.issues.includes('nba:MODEL_TIER_COVERAGE_INCOMPLETE'));
});
