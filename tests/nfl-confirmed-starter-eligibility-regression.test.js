import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('game eligibility requires confirmed starter, not just recent high usage',()=>{
 const source=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 assert.match(source,/eligible=availabilityVerified&&!needsReview&&x\._roleSignal\?\.status==='CONFIRMED_STARTER'/);
 assert.doesNotMatch(source,/eligible=availabilityVerified&&!needsReview&&!!x\._roleSignal/);
});
