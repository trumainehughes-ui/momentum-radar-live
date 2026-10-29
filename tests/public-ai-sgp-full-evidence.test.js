import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const advisory=readFileSync(new URL('../lib/ai-mechanics/ai-advisors.js',import.meta.url),'utf8');
const pregame=readFileSync(new URL('../lib/pregame-ai-review.js',import.meta.url),'utf8');

test('Nuke advisor evaluates complete supplied card instead of ten-leg subset',()=>{
 assert.match(advisory,/const legs=list\(row\.legs\),cats=/);
 assert.doesNotMatch(advisory,/const legs=list\(row\.legs,10\)/);
 assert.match(advisory,/legs\.length>NFL_SGP_TIERS\.Nuke\.maxLegs/);
});
test('AI pregame evidence includes four tiers and flexible NFL leg bounds',()=>{
 assert.match(pregame,/NFL_SGP_TIERS\[x\.risk\]\?\.maxLegs/);
 assert.match(pregame,/\}\)\)\.slice\(0,4\)/);
 assert.doesNotMatch(pregame,/legs:x\.legs\.slice\(0,7\)/);
});
