import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProjectionEvidence,projectionEvidenceComparable,projectionEvidenceLabel} from '../lib/shared-sports-projection-evidence.js';
for(const [sport,stats] of [['nfl',{passing_yards:278,rushing_yards:22}],['nba',{points:30.9,rebounds:4.6,assists:6.3,threes:1.7}]]){
 test(sport+' external projection stays research-only',()=>{
  const e=normalizeProjectionEvidence({sport,playerId:'p1',team:'AAA',opponent:'BBB',source:'FantasyBot',asOf:'2026-10-20T00:00:00Z',stats:{...stats,invalid:-5}});
  assert.equal(e.bookVerified,false);assert.equal(e.starterVerified,false);assert.equal(e.sgpVerified,false);
  assert.equal(e.stats.invalid,undefined);assert.match(projectionEvidenceLabel(e),/NOT A SPORTSBOOK OFFER/);
  assert.equal(projectionEvidenceComparable(e,{...e}),true);
  assert.equal(projectionEvidenceComparable(e,{...e,team:'CCC'}),false);
 });
}
test('reject unsupported sport and nonfinite stats',()=>{
 assert.throws(()=>normalizeProjectionEvidence({sport:'mlb'}),/Unsupported sport/);
 const e=normalizeProjectionEvidence({sport:'nba',stats:{points:NaN,assists:Infinity,rebounds:5}});
 assert.deepEqual(e.stats,{rebounds:5});
});
