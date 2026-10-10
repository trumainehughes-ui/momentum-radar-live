import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('NFL schedule view checks official weekly injuries for all rendered matchups',()=>{
 assert.ok(ui.includes("async function nflLoadInjuryBoard(date)"));
 assert.ok(ui.includes("'/api/nfl-injury-board?'"));
 assert.ok(ui.includes('data-nfl-injury-game='));
 assert.ok(ui.includes("if(d?.date)nflLoadInjuryBoard(d.date)"));
 assert.ok(ui.includes('final game-day inactives not verified'));
});
