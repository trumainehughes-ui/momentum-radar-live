import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');

test('NBA Top 10 does not require strictly favorable DVP factors',()=>{
 const section=source.slice(source.indexOf('const candidates=(Array.isArray(pre.research)'),source.indexOf("qs('#nbaTopTitle').textContent='Top 10",source.indexOf('const candidates=(Array.isArray(pre.research)')));
 assert.match(section,/OBSERVED_DVP_ADJUSTMENT/);
 assert.doesNotMatch(section,/Number\(p\.defenseVsPosition\.factor\)>1/);
 assert.match(section,/\.slice\(0,10\)/);
});

test('NBA Top 10 explains short defensive-data coverage',()=>{
 assert.match(source,/positions remain unfilled/);
 assert.match(source,/lack observed DVP evidence/);
});
