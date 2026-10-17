import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NBA uses NBA source health instead of the NFL AI status and button',()=>{
 const ui=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const nba=ui.split('function renderNbaGame(d){')[1].split('async function loadNbaPublicBook(')[0];
 assert.match(nba,/state\.nbaBookResearch\?\.sourceHealth\?\.FanDuel/);
 assert.match(nba,/FanDuel Colorado prices have not been verified/);
 assert.doesNotMatch(nba,/state\.aiData|data-view="ai"/);
 const api=readFileSync(new URL('../api/nba-public-book-research.js',import.meta.url),'utf8');
 assert.match(api,/sourceHealth:/);
 assert.match(api,/noPriceInference:true/);
});
