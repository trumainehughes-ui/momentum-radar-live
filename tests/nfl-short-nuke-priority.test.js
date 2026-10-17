import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNflAdaptiveNuke} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const leg=(id)=>({cat:'receiving',playerID:String(id),predictiveProjection:40,analyticsThreshold:65});
test('Nuke prefers shortest evidence-supported composition over seven legs',()=>{
 const make=(risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>leg(i)),tierAssessment:{compositionOk:count>=4},sgpScore:70});
 const chosen=selectNflAdaptiveNuke(make);
 assert.equal(chosen.adaptiveLegCount,4);
 assert.equal(chosen.combinedBookQuoteVerified,undefined);
});
test('Nuke rejects conservative thresholds even when composition passes',()=>{
 const make=(risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>({...leg(i),analyticsThreshold:30})),tierAssessment:{compositionOk:true}});
 assert.equal(selectNflAdaptiveNuke(make).legs.length,0);
});
test('cache sanitizer accepts three through seven Nuke legs',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(src,/c\.legs\.length>=3&&c\.legs\.length<=7/);
 assert.match(src,/adaptive-short-nuke-v1/);
});
