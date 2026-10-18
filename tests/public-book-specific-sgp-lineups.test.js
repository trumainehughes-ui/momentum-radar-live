import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const nfl=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const nba=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
test('public NFL keeps each sportsbook lineup independent',()=>{
 assert.match(nfl,/renderBookSlips\('FanDuel'\)/);
 assert.match(nfl,/renderBookSlips\('DraftKings'\)/);
 assert.match(nfl,/c\.legs\[0\]\?\.bookOffer\?\.book===book/);
 assert.match(nfl,/o\.book!==firstBook/);
});
test('NBA never substitutes one sportsbook inventory for another',()=>{
 assert.match(nba,/renderBook\('FanDuel'\)/);
 assert.match(nba,/renderBook\('DraftKings'\)/);
 assert.match(nba,/l\.bookOffer\.book===book/);
 assert.match(nba,/s\.combinedBookQuoteVerified===true/);
 assert.match(nba,/NBA model-only research \(not sportsbook lineups\)/);
});
