import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNflAdaptiveTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const leg=i=>({cat:'receiving',playerID:String(i),projection:40,analyticsThreshold:70});
test('Nuke can use eight legs if shorter combinations are invalid',()=>{
 const c=selectNflAdaptiveTier((risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>leg(i)),tierAssessment:{compositionOk:count===8}}),'Nuke');
 assert.equal(c.legs.length,8);
 assert.equal(c.payoutTargetVerified,false);
});
test('Nuke never claims price verification for model-only combinations',()=>{
 const c=selectNflAdaptiveTier((risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>leg(i)),tierAssessment:{compositionOk:count===5}}),'Nuke');
 assert.equal(c.selectionObjective,'MODEL_RESEARCH_ONLY_PRICE_NOT_VERIFIED');
});
test('cache supports up to ten Nuke legs',()=>{
 const s=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(s,/c\.risk==='Nuke'\?10:7/);
 assert.match(s,/nuke-10leg-v1/);
});
