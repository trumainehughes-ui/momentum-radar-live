import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NFL final SGP gate checks all injury-status fields including questionable',()=>{
 const source=readFileSync(new URL('../lib/ai-mechanics/nfl-sgp-tiers.js',import.meta.url),'utf8');
 assert.match(source,/const statuses=\[x\?\.injuryStatus,x\?\.availability,x\?\.status\]/);
 assert.match(source,/statuses\.some\(status=>excluded\.has\(status\)\)/);
 assert.match(source,/'QUESTIONABLE'/);
});
