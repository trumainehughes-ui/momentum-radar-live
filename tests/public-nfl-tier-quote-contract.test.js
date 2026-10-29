import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyNflSgpOdds} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
test('public verified SGP serializer requires exact matching tier and publishable quote',()=>{
 const source=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 assert.match(source,/classifyNflSgpOdds\(Number\(x\.actualSgpOdds\)\)===q\.risk/);
 assert.match(source,/x\.publishable===true/);
 assert.match(source,/assessNflSgpTier\(/);
 assert.equal(classifyNflSgpOdds(2600),'Medium');
 assert.equal(classifyNflSgpOdds(10000),'Nuke');
});
