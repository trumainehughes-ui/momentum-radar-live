import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('public SGP uniqueness is per player, team, market and target',()=>{
 assert.match(page,/const key=\[name,team,market,target\]\.join\('\|'\)/);
 assert.match(page,/names\.has\(key\)/);
 assert.doesNotMatch(page,/names\.has\(name\)/);
});
test('public SGP shows individual market rationale without adding an unverified price',()=>{
 assert.match(page,/class="sgp-leg-why">Why: /);
 assert.match(page,/publicWhy\(l,String\(l\.category\|\|''\)\.toLowerCase\(\)\)/);
 assert.match(page,/Combined sportsbook odds and player lines are not verified/);
});
