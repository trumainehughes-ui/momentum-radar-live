import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseNflCheckpointQuotes} from '../lib/nfl-checkpoint-quote-selection.js';
test('Nuke and Large are considered in the bounded quote budget',()=>{
 const pool=['Small','Medium','Large','Nuke'].map(risk=>({risk,book:'DraftKings'}));
 const out=chooseNflCheckpointQuotes(pool,{gameId:'401872966',stage:'DAY_BEFORE',max:3});
 assert.equal(out.length,3);
 assert.equal(out[0].risk,'Nuke');
 assert.equal(out[1].risk,'Large');
 assert.equal(out[2].risk,'Medium');
});
test('never exceeds three paid checkpoint quote candidates',()=>{
 const pool=['Small','Medium','Large','Nuke'].flatMap(risk=>['DraftKings','FanDuel'].map(book=>({risk,book})));
 const out=chooseNflCheckpointQuotes(pool,{gameId:'401872966',stage:'FINAL_T_MINUS_30',max:10});
 assert.equal(out.length,3);
 assert.equal(new Set(out.map(x=>x.risk)).size,3);
});
