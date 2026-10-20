import test from 'node:test';
import assert from 'node:assert/strict';
import {publicNbaCollectorHealth} from '../lib/public-nba-collector-health.js';
test('public NBA collector health reports aggregate coverage, not internal data',()=>{
 const data=publicNbaCollectorHealth({checkedAt:'2026-10-20T04:00:00Z',
  results:[{gameId:'1',projectionCount:12,secret:'never publish'},
   {gameId:'2',projectionCount:0,reason:'missing roster'}]});
 assert.equal(data.projectionCount,12);assert.equal(data.emptyGames,1);
 assert.equal(data.hasResearchProjections,true);
 assert.equal(JSON.stringify(data).includes('secret'),false);
 assert.match(data.note,/not verified starters or sportsbook offers/);
});
