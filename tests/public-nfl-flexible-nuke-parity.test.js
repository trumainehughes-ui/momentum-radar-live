import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NFL_SGP_TIERS} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

const advisory=readFileSync(new URL('../lib/ai-mechanics/ai-advisors.js',import.meta.url),'utf8');
const publicView=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');

test('AI Nuke advisory uses shared flexible leg limits and market identity',()=>{
 assert.equal(NFL_SGP_TIERS.Nuke.maxLegs,20);
 assert.match(advisory,/legs\.length<NFL_SGP_TIERS\.Nuke\.minLegs/);
 assert.match(advisory,/legs\.length>NFL_SGP_TIERS\.Nuke\.maxLegs/);
 assert.match(advisory,/duplicate player market/);
 assert.match(advisory,/more than two markets for one player/);
 assert.doesNotMatch(advisory,/requires 5–7 legs/);
});

test('public NFL research does not silently truncate valid flexible Nuke cards to ten legs',()=>{
 assert.match(publicView,/card\.legs\.slice\(0,PUBLIC_NFL_RESEARCH_MAX_LEGS\[risk\]\)/);
 assert.doesNotMatch(publicView,/card\.legs\.slice\(0,10\)/);
});
