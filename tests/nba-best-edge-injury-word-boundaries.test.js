import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../lib/nba-best-edge-parlay.js',import.meta.url),'utf8');
test('NBA Edge Hunter holds questionable and reserve-listed candidates without substring false positives',()=>{
 assert.ok(source.includes('/\\b(?:OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b/i.test('));
 assert.ok(!source.includes('/OUT|INACTIVE|DOUBTFUL|SUSPENDED/i.test('));
});

test('public NBA Edge Hunter research also withholds questionable and reserve-listed players',()=>{
 const endpoint=readFileSync(new URL('../api/nba-best-edge.js',import.meta.url),'utf8');
 assert.ok(endpoint.includes('/\\b(OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b/i.test('));
});
