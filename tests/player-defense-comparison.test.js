import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePlayerToDefense} from '../lib/player-defense-comparison.js';
test('reports measured difference without inventing projection',()=>{
 const r=comparePlayerToDefense({averages:{passingYards:250},games:10},
 {allowedPerGame:{passingYards:270},games:10},'passingYards');
 assert.equal(r.ok,true);assert.equal(r.delta,20);
 assert.equal(r.direction,'opponent_allows_more');
 assert.equal('probability' in r,false);
});
test('fails closed on missing defensive samples',()=>{
 assert.equal(comparePlayerToDefense({averages:{PTS:25}},null,'PTS').ok,false);
});
