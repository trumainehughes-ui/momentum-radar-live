import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVerifiedNflWeatherGame} from '../lib/nfl-weather-verified-game.js';
const id='401234567',kickoff='2026-10-18T20:00:00Z';
const venue={gameId:id,stadiumId:'stadium-verified',espnVenueId:'1234',scheduleSource:'https://www.nfl.com/schedules/',kickoffAt:kickoff,roofStatus:'closed',stadiumEvidence:{url:'https://www.nfl.com/stadiums/',stadiumId:'stadium-verified',espnVenueId:'1234',checkedAt:'2026-10-15T16:00:00Z',verificationMethod:'fetched_source',verificationStatus:'verified',sourceGameId:'401234567'},awayTeam:'DEN',homeTeam:'KC'};
const summary={header:{id,competitions:[{id,venue:{id:'1234'},date:kickoff,competitors:[{team:{abbreviation:'DEN'}},{team:{abbreviation:'KC'}}]}]}};
const fetcher=async()=>({ok:true,json:async()=>summary});
const resolve=(record=venue,fetch=fetcher)=>resolveVerifiedNflWeatherGame({gameId:id,registryJson:JSON.stringify({[id]:record}),fetcher:fetch});
test('trusted stadium and live ESPN event must agree on teams and kickoff',async()=>{
 const r=await resolve();assert.equal(r.venue.stadiumId,'stadium-verified');assert.deepEqual(r.schedule.teams,['DEN','KC']);
});
test('mismatched home or away team blocks weather game',async()=>{
 await assert.rejects(()=>resolve({...venue,homeTeam:'LV'}),/schedule_venue_teams_mismatch/);
});
test('kickoff difference beyond one minute blocks weather game',async()=>{
 await assert.rejects(()=>resolve({...venue,kickoffAt:'2026-10-18T21:00:00Z'}),/schedule_venue_kickoff_mismatch/);
});
test('missing team linkage blocks weather game',async()=>{
 await assert.rejects(()=>resolve({...venue,awayTeam:undefined}),/venue_teams_missing/);
});

test('unattested stadium cannot proceed to ESPN schedule fetch',async()=>{
 let called=false;
 await assert.rejects(()=>resolve({...venue,stadiumEvidence:undefined},async()=>{called=true;return {ok:true,json:async()=>summary}}),/stadium_attestation_missing/);
 assert.equal(called,false);
});
test('placeholder stadium cannot be treated as verified',async()=>{
 await assert.rejects(()=>resolve({...venue,stadiumId:'test-indoor-stadium'}),/placeholder_stadium_not_allowed/);
});

test('source URL alone is not sufficient stadium verification',async()=>{
 await assert.rejects(()=>resolve({...venue,stadiumEvidence:{url:'https://www.nfl.com/stadiums/',stadiumId:'stadium-verified',espnVenueId:'1234',checkedAt:'2026-10-15T16:00:00Z'}}),/stadium_evidence_not_verified/);
});

test('ESPN stadium mismatch blocks weather report',async()=>{
 await assert.rejects(()=>resolve({...venue,espnVenueId:'9999'}),/schedule_stadium_identity_mismatch/);
});

test('outdoor coordinates must match source attestation',async()=>{
 const outdoor={...venue,roofStatus:'outdoor',latitude:39.74,longitude:-104.99,venueSource:'https://www.nfl.com/stadiums/',stadiumEvidence:{...venue.stadiumEvidence,coordinates:{latitude:40.5,longitude:-105.3}}};
 await assert.rejects(()=>resolve(outdoor),/stadium_coordinates_evidence_mismatch/);
});
test('outdoor coordinates without source attestation fail closed',async()=>{
 const outdoor={...venue,roofStatus:'outdoor',latitude:39.74,longitude:-104.99,venueSource:'https://www.nfl.com/stadiums/'};
 await assert.rejects(()=>resolve(outdoor),/stadium_coordinates_not_attested/);
});
