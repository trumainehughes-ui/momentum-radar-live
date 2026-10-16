import test from 'node:test';
import assert from 'node:assert/strict';
import {nflPricingCheckpointStage} from '../lib/nfl-scheduled-book-checkpoint.js';
const game=(kickoff)=>({gameId:'401872995',status:'SCHEDULED',kickoff});
test('NFL scheduled pricing checkpoint is due in Eastern day-ahead window',()=>{
 const kickoff='2026-10-16T00:15:00Z'; // Thursday evening in Eastern time
 assert.equal(nflPricingCheckpointStage(game(kickoff),{now:Date.parse('2026-10-14T19:00:00Z')}),'DAY_AHEAD');
});
test('NFL scheduled pricing checkpoint runs in final 30 minutes',()=>{
 const kickoff='2026-10-16T00:15:00Z';
 assert.equal(nflPricingCheckpointStage(game(kickoff),{now:Date.parse('2026-10-15T23:50:00Z')}),'FINAL_T_MINUS_30');
 assert.equal(nflPricingCheckpointStage(game(kickoff),{now:Date.parse('2026-10-16T00:16:00Z')}),null);
});
