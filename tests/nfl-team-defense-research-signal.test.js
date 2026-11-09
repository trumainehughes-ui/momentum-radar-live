import test from 'node:test';
import assert from 'node:assert/strict';
import {nflTeamDefenseResearchSignal} from '../lib/nfl-team-defense-research-signal.js';
test('no team data never yields a defensive signal',()=>{
 assert.equal(nflTeamDefenseResearchSignal('rushingYards',{available:false}).available,false);
});
test('no verified league baseline prevents ranking or projection changes',()=>{
 const x=nflTeamDefenseResearchSignal('passingYards',{available:true,value:250,metric:'opponent-passing-yards-per-game'});
 assert.equal(x.available,true);
 assert.equal(x.ranked,false);
 assert.equal(x.projectionAdjustmentApplied,false);
});
test('verified league baseline permits descriptive relative allowance only',()=>{
 const x=nflTeamDefenseResearchSignal('rushingYards',{available:true,value:120,metric:'opponent-rushing-yards-per-game'},{leagueBaseline:100});
 assert.equal(x.direction,'MORE_ALLOWED');
 assert.equal(x.relativeAllowancePct,20);
 assert.equal(x.projectionAdjustmentApplied,false);
});
