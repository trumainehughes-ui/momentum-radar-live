import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNflAdaptiveTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const leg=i=>({cat:'receiving',playerID:String(i),projection:40,analyticsThreshold:70});
test('Nuke never stretches beyond seven legs to simulate its +10000 payout',()=>{
 const c=selectNflAdaptiveTier((risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>leg(i)),tierAssessment:{compositionOk:count===8}}),'Nuke');
 assert.equal(c.legs.length,0);
 assert.equal(c.actualSgpOdds,null);
 assert.equal(c.payoutTargetVerified,false);
});
test('Nuke never claims price verification for model-only combinations',()=>{
 const c=selectNflAdaptiveTier((risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>leg(i)),tierAssessment:{compositionOk:count===5}}),'Nuke');
 assert.equal(c.selectionObjective,'MODEL_RESEARCH_ONLY_PRICE_NOT_VERIFIED');
});
test('cached Nuke tier enforces shared 5–7 leg limit',()=>{
 const s=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(s,/c\.legs\.length>=NFL_SGP_TIERS\[c\.risk\]\.minLegs/);
 assert.match(s,/c\.legs\.length<=NFL_SGP_TIERS\[c\.risk\]\.maxLegs/);
 assert.match(s,/Number\(c\.requiredLegs\)===c\.legs\.length/);
});
