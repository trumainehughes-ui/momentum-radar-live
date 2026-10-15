import test from 'node:test';
import assert from 'node:assert/strict';
import {nflPricingCheckpointStage} from '../lib/nfl-scheduled-book-checkpoint.js';
const game={gameId:'401872995',status:'SCHEDULED',kickoff:'2026-10-16T00:15:00Z'};
test('Thursday evening Eastern kickoff is not day-ahead on Thursday',()=>{
 assert.equal(nflPricingCheckpointStage(game,{now:Date.parse('2026-10-15T17:30:00Z')}),null);
});
test('day-ahead window opens Wednesday and never extends beyond 30 hours',()=>{
 assert.equal(nflPricingCheckpointStage(game,{now:Date.parse('2026-10-14T19:00:00Z')}),'DAY_AHEAD');
 assert.equal(nflPricingCheckpointStage(game,{now:Date.parse('2026-10-14T17:30:00Z')}),null);
});
test('final checkpoint only inside last thirty minutes',()=>{
 assert.equal(nflPricingCheckpointStage(game,{now:Date.parse('2026-10-15T23:44:00Z')}),null);
 assert.equal(nflPricingCheckpointStage(game,{now:Date.parse('2026-10-15T23:50:00Z')}),'FINAL_T_MINUS_30');
});
