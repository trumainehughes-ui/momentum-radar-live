import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const owner=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nba=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
const publicPage=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('owner NBA Edge Hunter tab is backed by fail-closed read-only API',()=>{
 assert.match(owner,/data-nbatab="edgehunter"/);
 assert.match(nba,/\/api\/nba-edge-hunter\?date=/);
 assert.match(nba,/No verified four-leg Edge Hunter selection is ready/);
 assert.match(nba,/Research only; no sportsbook prices or publishable parlays are implied/);
});
test('public surface exposes NBA Edge Hunter navigation without inventing prices',()=>{
 assert.match(publicPage,/NBA Edge Hunter/);
 assert.match(publicPage,/href="\/#nba"/);
});
