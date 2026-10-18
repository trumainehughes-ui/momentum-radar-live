import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNflAdaptiveTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const legs=[
 {name:'Javonte Williams',cat:'td'},
 {name:'Jordan Love',cat:'passing',predictiveProjection:290,analyticsThreshold:300},
 {name:'Christian Watson',cat:'receiving',predictiveProjection:95,analyticsThreshold:100},
 {name:'Matthew Golden',cat:'receiving',predictiveProjection:79,analyticsThreshold:80},
 {name:'George Pickens',cat:'receptions',predictiveProjection:5.7,analyticsThreshold:6}
];
const candidate=(odds,verified=true)=>({risk:'Nuke',legs,
 tierAssessment:{compositionOk:true},actualSgpOdds:odds,
 combinedBookQuoteVerified:verified,publishable:true});
test('mispriced +2600 five-leg Nuke remains unquoted research only',()=>{
 const result=selectNflAdaptiveTier((_risk,count)=>count===5?candidate(2600):null,'Nuke');
 assert.equal(result.payoutTargetVerified,false);
 assert.equal(result.publishable,false);
 assert.equal(result.combinedBookQuoteVerified,false);
 assert.equal(result.actualSgpOdds,null);
});
test('Nuke must have actual verified combined quote and publishable status',()=>{
 const unverified=selectNflAdaptiveTier((_risk,count)=>count===5?candidate(10000,false):null,'Nuke');
 assert.equal(unverified.publishable,false);
 const verified=selectNflAdaptiveTier((_risk,count)=>count===5?candidate(10000):null,'Nuke');
 assert.equal(verified.payoutTargetVerified,true);
 assert.equal(verified.tierVerified,true);
});
