import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const owner=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const publicPage=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('owner and public interfaces preserve keyboard-visible focus for SGP controls',()=>{
 for(const page of [owner,publicPage]){
  assert.match(page,/button:focus-visible/);
  assert.match(page,/outline-offset:3px/);
 }
});
test('public SGP controls remain read-only',()=>{
 assert.match(publicPage,/refreshReadOnlyPredictions/);
 assert.match(publicPage,/renderGame\(state\.selectedData\)/);
});
