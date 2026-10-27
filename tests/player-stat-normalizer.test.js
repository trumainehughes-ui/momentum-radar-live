import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlayerBoxscoreRecord} from '../lib/player-stat-normalizer.js';
test('NBA points rebounds assists normalize as numbers',()=>{
 const r=normalizePlayerBoxscoreRecord({league:'NBA',statLabels:['PTS','REB','AST','FG'],stats:['25','11','8','9-20']});
 assert.equal(r.points,25);assert.equal(r.rebounds,11);assert.equal(r.assists,8);
 assert.equal(r.numericStats.FG,undefined);
});
test('NFL passing and rushing yards remain separate',()=>{
 const p=normalizePlayerBoxscoreRecord({league:'NFL',category:'passing',statLabels:['YDS'],stats:['250']});
 const r=normalizePlayerBoxscoreRecord({league:'NFL',category:'rushing',statLabels:['YDS'],stats:['70']});
 assert.equal(p.passingYards,250);assert.equal(p.rushingYards,null);
 assert.equal(r.rushingYards,70);assert.equal(r.passingYards,null);
});
test('MLB hits and home runs normalize',()=>{
 const r=normalizePlayerBoxscoreRecord({league:'MLB',statLabels:['H','HR','AVG'],stats:['2','1','.300']});
 assert.equal(r.hits,2);assert.equal(r.homeRuns,1);assert.equal(r.numericStats.AVG,.3);
});
