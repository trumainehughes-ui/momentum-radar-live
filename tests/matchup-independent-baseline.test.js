import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('defensive comparison does not reuse target player game as independent evidence',()=>{
 const source=readFileSync(new URL('../api/matchup-research.js',import.meta.url),'utf8');
 assert.match(source,/playerGameIds=new Set\(playerRows\.map/);
 assert.match(source,/if\(playerGameIds\.has\(String\(g\.event\.id\)\)\)return \[\]/);
});
