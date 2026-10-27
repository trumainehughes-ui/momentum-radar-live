import test from 'node:test';
import assert from 'node:assert/strict';
import {opponentDefensiveAllowances} from '../lib/opponent-defensive-allowances.js';
test('calculates defensive allowances across completed games',()=>{
 const rows=[
 {defenseTeamId:'A',gameId:'1',gameDate:'2026-01-01',gameStatus:'STATUS_FINAL',allowedStats:{passingYards:200}},
 {defenseTeamId:'A',gameId:'2',gameDate:'2026-01-02',gameStatus:'STATUS_FINAL',allowedStats:{passingYards:300}},
 {defenseTeamId:'A',gameId:'3',gameDate:'2026-01-03',gameStatus:'STATUS_IN_PROGRESS',allowedStats:{passingYards:500}}
 ];
 const result=opponentDefensiveAllowances(rows)[0];
 assert.equal(result.games,2);assert.equal(result.allowedPerGame.passingYards,250);
});
