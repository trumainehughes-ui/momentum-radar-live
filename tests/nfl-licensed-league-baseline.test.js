import test from 'node:test';
import assert from 'node:assert/strict';
import {nflLicensedLeagueBaseline} from '../lib/nfl-licensed-league-baseline.js';
const metric='opponent-rushing-yards-per-game';
test('cannot rank a defense against sparse licensed coverage',()=>{
 const x=nflLicensedLeagueBaseline({BUF:{[metric]:100},MIN:{[metric]:120}},metric);
 assert.equal(x.available,false);
 assert.equal(x.reason,'INSUFFICIENT_LEAGUE_COVERAGE');
});
test('league baseline uses only numeric values with at least 24 teams',()=>{
 const teams=Object.fromEntries(Array.from({length:25},(_,i)=>['TEAM'+i,{[metric]:i===0?'100':100}]));
 const x=nflLicensedLeagueBaseline(teams,metric);
 assert.equal(x.available,true);
 assert.equal(x.value,100);
 assert.equal(x.teamsCovered,24);
 assert.equal(x.projectionAdjustmentApplied,false);
});
test('offensive metrics cannot be used as defensive baselines',()=>{
 assert.equal(nflLicensedLeagueBaseline({},'points-per-game').available,false);
});
