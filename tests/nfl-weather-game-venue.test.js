import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrustedGameVenue} from '../lib/nfl-weather-game-venue.js';
const base={gameId:'401234567',stadiumId:'stadium-test',scheduleSource:'https://www.nfl.com/schedules/2026/reg18/',kickoffAt:'2026-10-18T20:00:00Z',roofStatus:'closed'};
const now=Date.parse('2026-10-15T15:00:00Z');
test('trusted game venue validates schedule linkage',()=>assert.equal(validateTrustedGameVenue({gameId:base.gameId,venue:base,now}).roofStatus,'closed'));
test('mismatched game and missing stadium ID fail closed',()=>{
 assert.throws(()=>validateTrustedGameVenue({gameId:'401234568',venue:base,now}),/venue_game_mismatch/);
 assert.throws(()=>validateTrustedGameVenue({gameId:base.gameId,venue:{...base,stadiumId:''},now}),/stadium_id_missing/);
});
test('retractable roof needs confirmed status and evidence',()=>{
 assert.throws(()=>validateTrustedGameVenue({gameId:base.gameId,venue:{...base,retractableRoof:true,roofStatus:'unknown'},now}),/retractable_roof_unconfirmed/);
 assert.throws(()=>validateTrustedGameVenue({gameId:base.gameId,venue:{...base,retractableRoof:true},now}),/retractable_roof_evidence_missing/);
});
test('stale or distant kickoff is rejected',()=>assert.throws(()=>validateTrustedGameVenue({gameId:base.gameId,venue:base,now:Date.parse('2026-12-15T15:00:00Z')}),/kickoff_outside_review_window/));

test('unapproved schedule source cannot masquerade as NFL game metadata',()=>{
 assert.throws(()=>validateTrustedGameVenue({gameId:base.gameId,venue:{...base,scheduleSource:'https://evil.example/fixture'},now}),/schedule_source_not_allowlisted/);
 assert.throws(()=>validateTrustedGameVenue({gameId:base.gameId,venue:{...base,scheduleSource:'https://www.nfl.com.evil.example/game'},now}),/schedule_source_not_allowlisted/);
});
test('retractable roof evidence must be from an allowlisted HTTPS source',()=>{
 const venue={...base,retractableRoof:true,roofEvidence:'https://evil.example/roof'};
 assert.throws(()=>validateTrustedGameVenue({gameId:base.gameId,venue,now}),/untrusted_roof_evidence_source/);
});
