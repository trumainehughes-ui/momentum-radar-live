import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVerifiedNflWeatherGame} from '../lib/nfl-weather-verified-game.js';
const id='401234567',kickoff='2026-10-18T20:00:00Z';
const venue={gameId:id,stadiumId:'stadium-test',scheduleSource:'https://www.nfl.com/schedules/',kickoffAt:kickoff,roofStatus:'closed',awayTeam:'DEN',homeTeam:'KC'};
const summary={header:{id,competitions:[{id,date:kickoff,competitors:[{team:{abbreviation:'DEN'}},{team:{abbreviation:'KC'}}]}]}};
const fetcher=async()=>({ok:true,json:async()=>summary});
const resolve=(record=venue,fetch=fetcher)=>resolveVerifiedNflWeatherGame({gameId:id,registryJson:JSON.stringify({[id]:record}),fetcher:fetch});
test('trusted stadium and live ESPN event must agree on teams and kickoff',async()=>{
 const r=await resolve();assert.equal(r.venue.stadiumId,'stadium-test');assert.deepEqual(r.schedule.teams,['DEN','KC']);
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
