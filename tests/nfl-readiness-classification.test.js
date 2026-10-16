import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileNflReadinessStatus} from '../lib/nfl-readiness-classification.js';

test('fresh model-only snapshot remains MODEL_ONLY before scheduled collector audit', () => {
 assert.equal(reconcileNflReadinessStatus({marketStatus:'MODEL_ONLY',collectorCoverage:null}), 'MODEL_ONLY');
});
test('model readiness never implies a verified or publishable sportsbook quote', () => {
 assert.equal(reconcileNflReadinessStatus({marketStatus:'MODEL_ONLY',quoteVerified:false,collectorCoverage:'READY_3_OF_3'}), 'MODEL_ONLY');
 assert.equal(reconcileNflReadinessStatus({marketStatus:'BOOK_QUOTED_PARTIAL',quoteVerified:true}), 'BOOK_QUOTED');
});
test('collector-ready but missing snapshot has its own non-publishable diagnostic', () => {
 assert.equal(reconcileNflReadinessStatus({marketStatus:'PENDING_SNAPSHOT',collectorCoverage:'READY_3_OF_3'}), 'MODEL_READY_MARKET_SNAPSHOT_MISSING');
 assert.equal(reconcileNflReadinessStatus({marketStatus:'PENDING_SNAPSHOT',collectorCoverage:null}), 'NOT_READY');
});
test('stale, incomplete and unavailable market evidence fail closed', () => {
 for (const marketStatus of ['STALE','NOT_READY','UNVERIFIED_SNAPSHOT','SNAPSHOT_STORAGE_UNAVAILABLE','UNKNOWN']) {
  assert.equal(reconcileNflReadinessStatus({marketStatus,collectorCoverage:'READY_3_OF_3'}), 'NOT_READY');
 }
});
