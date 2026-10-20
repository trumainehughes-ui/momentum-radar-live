import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('public NBA research card labels each game starter evidence honestly',()=>{
 const js=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.match(js,/l\.starterVerified===true\?'GAME STARTER VERIFIED':'STARTER UNCONFIRMED'/);
 assert.match(js,/Combined sportsbook odds NOT VERIFIED/);
});
test('NBA collector marks a candidate tier not ready when observed starter evidence excludes a leg',()=>{
 const js=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 assert.match(js,/eventStarters\.checked===true&&!startersReady\?'NOT_READY'/);
});
