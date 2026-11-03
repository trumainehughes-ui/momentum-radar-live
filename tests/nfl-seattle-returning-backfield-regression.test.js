import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Seahawks game holds prior lead back after both injured RBs return',()=>{
 const src=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 assert.match(src,/gameId\)==='401873036'&&localDate==='2026-11-02'/);
 assert.match(src,/name:'Emanuel Wilson',position:'RB',status:'ROLE_REVIEW'/);
 assert.match(src,/blockedNames=new Set\(blockers\.flatMap/);
});
