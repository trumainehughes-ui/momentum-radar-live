import test from 'node:test';
import assert from 'node:assert/strict';
import {nbaMatchupIntelligence,nbaAiEvidenceDigest} from '../lib/nba-matchup-intelligence.js';
const base={player:{id:'42',position:'PG',perGame:{points:20,assists:7.5,rebounds:4,threes:2.2}},
 opponent:{teamId:'BOS',allowedByPosition:{PG:{games:12,points:22,assists:8,rebounds:4.2,threes:2.8}}},
 sampleSource:'CURRENT_SEASON',historicalSeason:2027,
 asOf:'2026-10-19T18:00:00Z'};
test('NBA AI matchup context is advisory and cannot claim sportsbook verification',()=>{
 const r=nbaMatchupIntelligence(base);
 assert.equal(r.status,'ADVISORY_ONLY');assert.equal(r.metrics.assists.opponentPositionAllowed,8);
 assert.equal(r.metrics.assists.status,'CONTEXT_ONLY');
 assert.equal(r.sportsbookVerified,false);assert.equal(r.aiReviewed,false);
 assert.equal(nbaAiEvidenceDigest(r).sportsbookVerified,false);
});
test('missing or thin position sample cannot create invented matchup data',()=>{
 const r=nbaMatchupIntelligence({...base,opponent:{teamId:'BOS',allowedByPosition:{PG:{games:2,assists:10}}}});
 assert.equal(r.status,'NOT_READY');
 assert.equal(r.metrics.assists.status,'INSUFFICIENT_EVIDENCE');
 assert.equal(r.metrics.points.opponentPositionAllowed,null);
});
test('missing position or opponent identity fails closed',()=>{
 const r=nbaMatchupIntelligence({...base,player:{position:'G',perGame:{assists:7}},opponent:{}});
 assert.equal(r.status,'NOT_READY');assert.ok(r.warnings.includes('POSITION_NOT_VERIFIED'));
 assert.ok(r.warnings.includes('OPPONENT_NOT_VERIFIED'));
});

test('prior-season NBA position averages cannot be described as current matchup evidence',()=>{
 const r=nbaMatchupIntelligence({...base,sampleSource:'PRIOR_SEASON',historicalSeason:2026});
 assert.equal(r.status,'NOT_READY');
 assert.ok(r.warnings.includes('PRIOR_SEASON_BASELINE'));
 assert.equal(nbaAiEvidenceDigest(r).historicalSeason,2026);
});
test('missing season provenance blocks advisory-ready claims',()=>{
 const r=nbaMatchupIntelligence({...base,sampleSource:'UNKNOWN'});
 assert.equal(r.status,'NOT_READY');
 assert.ok(r.warnings.includes('SAMPLE_SEASON_UNVERIFIED'));
});
