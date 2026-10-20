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

test('public coverage does not misrepresent an unobserved cron run as empty predictions',()=>{
 assert.equal(publicNbaCollectorHealth({}).coverageStatus,'NOT_OBSERVED');
 assert.equal(publicNbaCollectorHealth({results:[{projectionCount:0}]}).coverageStatus,'NO_RESEARCH_PROJECTIONS');
});

test('held snapshot projections remain visible in public research coverage',()=>{
 const result=publicNbaCollectorHealth({results:[{status:'held',projectionCount:12}]});
 assert.equal(result.heldGames,1);
 assert.equal(result.projectionCount,12);
 assert.equal(result.coverageStatus,'RESEARCH_AVAILABLE');
});

test('public NBA collector states statistical evidence ranking basis',()=>{
 const report=publicNbaCollectorHealth({results:[]});
 assert.equal(report.selectionBasis,'HISTORICAL_GAME_EVIDENCE_NOT_POPULARITY');
});

test('public NBA health declares evidence-ranked model version',()=>{
 const report=publicNbaCollectorHealth({results:[]});
 assert.equal(report.expectedModelVersion,'v8-expanded-prior-season-sample-rebuild-evidence-v2');
});
