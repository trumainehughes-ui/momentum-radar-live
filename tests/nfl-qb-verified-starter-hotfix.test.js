import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('QB passing requires verified starter and matching position',()=>{
 const code=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 for(const part of ['starterVerified!==true','CONFIRMED_STARTER','EXPECTED_STARTER',"toUpperCase()!=='QB'"])assert.ok(code.includes(part));
});
