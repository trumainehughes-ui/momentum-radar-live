import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStatisticalPickEvidence} from '../lib/statistical-pick-evidence-policy.js';
const evidence={playerBaseline:25,opponentAllowed:27,opportunity:35,availability:'VERIFIED_ACTIVE',
 projectedStat:29,verifiedBookLine:24.5,bookVerified:true,starterVerified:true};
test('NFL and NBA picks cannot be promoted by popularity or public hype',()=>{
 const low=evaluateStatisticalPickEvidence({...evidence,popularity:0,publicBettingPct:0});
 const high=evaluateStatisticalPickEvidence({...evidence,popularity:999999,publicBettingPct:100});
 assert.deepEqual(low,high);assert.equal(low.popularityUsed,false);
 assert.equal(low.rawProjectionEdge,4.5);assert.equal(low.estimatedProbability,null);
});
test('verified sportsbook and verified eligibility are mandatory',()=>{
 assert.equal(evaluateStatisticalPickEvidence({...evidence,bookVerified:false}).eligible,false);
 assert.equal(evaluateStatisticalPickEvidence({...evidence,starterVerified:false}).eligible,false);
 assert.equal(evaluateStatisticalPickEvidence({...evidence,availability:'QUESTIONABLE'}).eligible,false);
});
test('missing opponent or workload evidence blocks a selection',()=>{
 assert.equal(evaluateStatisticalPickEvidence({...evidence,opponentAllowed:undefined}).eligible,false);
 assert.equal(evaluateStatisticalPickEvidence({...evidence,opportunity:undefined}).eligible,false);
});
