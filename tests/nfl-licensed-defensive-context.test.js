import test from 'node:test';
import assert from 'node:assert/strict';
import {nflLicensedDefensiveContext} from '../lib/nfl-licensed-defensive-context.js';
test('does not manufacture matchup edges without a licensed source',()=>{
 const x=nflLicensedDefensiveContext('rushingYards',{status:'NOT_LICENSED'});
 assert.equal(x.available,false);
 assert.equal(x.reason,'LICENSED_SOURCE_NOT_READY');
});
test('matches rushing to rushing allowance and receiving to team passing allowance',()=>{
 const e={status:'READY',source:'TeamRankings licensed feed',opponentTeam:'MIN',
  updatedAt:'2026-11-08T00:00:00Z',
  defensiveMetrics:{'opponent-rushing-yards-per-game':117.5,'opponent-passing-yards-per-game':155.2}};
 const run=nflLicensedDefensiveContext('rushingYards',e);
 const rec=nflLicensedDefensiveContext('receivingYards',e);
 assert.equal(run.value,117.5);
 assert.equal(rec.value,155.2);
 assert.match(rec.label,/not receiver-specific/);
 assert.equal(rec.projectionAdjustmentApplied,false);
 assert.equal(rec.sportsbookVerified,false);
});
test('missing and invalid team metrics do not become zero-yard evidence',()=>{
 const x=nflLicensedDefensiveContext('passingYards',{status:'READY',defensiveMetrics:{}});
 assert.equal(x.available,false);
 for(const missing of [null,undefined,'']){
  const z=nflLicensedDefensiveContext('passingYards',{status:'READY',defensiveMetrics:{'opponent-passing-yards-per-game':missing}});
  assert.equal(z.available,false);
 }
 const y=nflLicensedDefensiveContext('passingYards',{status:'READY',defensiveMetrics:{'opponent-passing-yards-per-game':-3}});
 assert.equal(y.available,false);
});
