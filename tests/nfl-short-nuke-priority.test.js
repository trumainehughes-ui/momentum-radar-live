import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNflAdaptiveNuke} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const leg=(id)=>({cat:['passing','rushing','receiving','receptions','td'][id%5],playerID:String(id),predictiveProjection:40,analyticsThreshold:65});
test('Nuke prefers shortest evidence-supported composition over seven legs',()=>{
 const make=(risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>leg(i)),tierAssessment:{compositionOk:count>=5},sgpScore:70});
 const chosen=selectNflAdaptiveNuke(make);
 assert.equal(chosen.adaptiveLegCount,5);
 assert.equal(chosen.combinedBookQuoteVerified,false);
 assert.equal(chosen.publishable,false);
});
test('Nuke with conservative model thresholds remains unpriced research',()=>{
 const make=(risk,count)=>({risk,legs:Array.from({length:count},(_,i)=>({...leg(i),analyticsThreshold:30})),tierAssessment:{compositionOk:true}});
 const candidate=selectNflAdaptiveNuke(make);
 assert.equal(candidate.legs.length,5);
 assert.equal(candidate.publishable,false);
 assert.equal(candidate.combinedBookQuoteVerified,false);
 assert.equal(candidate.actualSgpOdds,null);
});
test('cache sanitizer accepts only shared flexible Nuke leg bounds',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(src,/c\.legs\.length>=NFL_SGP_TIERS\[c\.risk\]\.minLegs/);
 assert.match(src,/c\.legs\.length<=NFL_SGP_TIERS\[c\.risk\]\.maxLegs/);
 assert.match(src,/adaptive-short-nuke-v1/);
});
