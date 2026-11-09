import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNflSgpOdds,tenDollarSgpPayout} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

test('four payout tiers classify verified book odds at requested boundaries',()=>{
 for(const [odds,risk] of [
  [100,'Small'],[300,'Small'],[301,'Medium'],[800,'Medium'],
  [801,'Large'],[2000,'Large'],[2001,'OUTSIDE_TIER_BANDS'],
  [9999,'OUTSIDE_TIER_BANDS'],[10000,'Nuke']
 ])assert.equal(classifyNflSgpOdds(odds),risk,String(odds));
 assert.equal(classifyNflSgpOdds(300.5),'UNKNOWN');
 assert.deepEqual(tenDollarSgpPayout(10000),{stake:10,netProfit:1000,totalReturn:1010,oddsCategory:'Nuke'});
});
