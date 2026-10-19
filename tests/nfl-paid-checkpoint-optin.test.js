import test from 'node:test';
import assert from 'node:assert/strict';
import {nflPaidScheduledCheckpointEnabled} from '../lib/nfl-scheduled-book-checkpoint.js';
test('paid scheduled checkpoints require explicit opt in',()=>{
 assert.equal(nflPaidScheduledCheckpointEnabled({}),false);
 assert.equal(nflPaidScheduledCheckpointEnabled({MOMENTUM_PAID_SCHEDULED_CHECKPOINTS:'false'}),false);
 assert.equal(nflPaidScheduledCheckpointEnabled({MOMENTUM_PAID_SCHEDULED_CHECKPOINTS:'enabled'}),true);
});
