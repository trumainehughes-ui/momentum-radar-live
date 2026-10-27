import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public NFL TD research never labels receptions as yards',()=>{
 const source=readFileSync(new URL('../lib/nfl-public-compact-sgp-cards.js',import.meta.url),'utf8');
 assert.match(source,/stats\.push\(fmt\(receptions\.projection\)\+' receptions'\)/);
 assert.doesNotMatch(source,/stats\.join\(' · '\)\+' yards'/);
});
