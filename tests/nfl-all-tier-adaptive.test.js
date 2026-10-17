import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNflAdaptiveTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const leg=i=>({cat:'passing',playerID:String(i),projection:100,analyticsThreshold:150});
for(const risk of ['Small','Medium','Nuke']){
 test(risk+' chooses shorter complete composition',()=>{
  const selected=selectNflAdaptiveTier((r,n)=>({risk:r,legs:Array.from({length:n},(_,i)=>leg(i)),tierAssessment:{compositionOk:n>=4}}),risk);
  assert.equal(selected.legs.length,4);
  assert.equal(selected.adaptiveLegCount,4);
 });
}
test('all tiers are wired into NFL market builder and cache',()=>{
 const s=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(s,/selectNflAdaptiveTier\(make,'Small'\)/);
 assert.match(s,/selectNflAdaptiveTier\(make,'Medium'\)/);
 assert.match(s,/all-tier-adaptive-v1/);
});

test('a verified price must fall within the requested tier band',()=>{
 const make=(risk,n)=>({risk,legs:Array.from({length:n},(_,i)=>leg(i)),tierAssessment:{compositionOk:n===3||n===4},
  combinedBookQuoteVerified:true,actualSgpOdds:n===3?1000:2500,estimatedHitProbability:n===3?.8:.6});
 const picked=selectNflAdaptiveTier(make,'Small');
 assert.equal(picked.adaptiveLegCount,4);
});
test('uncalibrated probability values cannot outrank a shorter candidate',()=>{
 const make=(risk,n)=>({risk,legs:Array.from({length:n},(_,i)=>leg(i)),tierAssessment:{compositionOk:n===3||n===4},
  estimatedHitProbability:n===4?75:0,sgpScore:n===4?90:30});
 const picked=selectNflAdaptiveTier(make,'Medium');
 assert.equal(picked.adaptiveLegCount,3);
});
