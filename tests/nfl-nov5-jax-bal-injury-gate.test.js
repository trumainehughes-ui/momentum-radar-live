import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Nov 5 JAX BAL official injury holds are date and matchup scoped',()=>{
 const src=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 assert.match(src,/localDate==='2026-11-05'&&gameAbbrs\.includes\('JAX'\)&&gameAbbrs\.includes\('BAL'\)/);
 for(const name of ['Lamar Jackson','Tyler Huntley','Bhayshul Tuten','Adam Randall','Nate Wiggins'])assert.ok(src.includes(name));
 assert.match(src,/status:rawStatus\.startsWith\('OUT'\)\?'OUT':'ROLE_REVIEW'/);
 assert.match(src,/normalizeName\(b\.name\)===normalizeName\(x\.name\)/);
});
