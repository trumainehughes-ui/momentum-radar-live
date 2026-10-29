import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNflSgpOdds,tenDollarSgpPayout} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

test('four payout tiers classify verified book odds at exact boundaries',()=>{
 assert.equal(classifyNflSgpOdds(500),'Small');
 assert.equal(classifyNflSgpOdds(1500),'Small');
 assert.equal(classifyNflSgpOdds(1501),'OUTSIDE_TIER_BANDS');
 assert.equal(classifyNflSgpOdds(2000),'Medium');
 assert.equal(classifyNflSgpOdds(2999),'Medium');
 assert.equal(classifyNflSgpOdds(3000),'Medium');
 assert.equal(classifyNflSgpOdds(3999),'Medium');
 assert.equal(classifyNflSgpOdds(4000),'Large');
 assert.equal(classifyNflSgpOdds(8000),'Large');
 assert.equal(classifyNflSgpOdds(10000),'Nuke');
 assert.equal(classifyNflSgpOdds(9999),'OUTSIDE_TIER_BANDS');
 assert.equal(classifyNflSgpOdds(3000.5),'UNKNOWN');
 assert.deepEqual(tenDollarSgpPayout(10000),{stake:10,netProfit:1000,totalReturn:1010,oddsCategory:'Nuke'});
});
