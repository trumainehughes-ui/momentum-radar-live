import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVerifiedNflWeatherReport} from '../lib/nfl-weather-verified-report.js';
const gameId='401234567',kickoffAt='2026-10-18T20:00:00Z';
const venue={gameId,stadiumId:'stadium-verified',espnVenueId:'1234',scheduleSource:'https://www.nfl.com/schedules/',roofStatus:'closed',kickoffAt,awayTeam:'DEN',homeTeam:'KC',stadiumEvidence:{url:'https://www.nfl.com/stadiums/',stadiumId:'stadium-verified',checkedAt:'2026-10-15T16:00:00Z',verificationMethod:'fetched_source',verificationStatus:'verified',sourceGameId:gameId}};
const summary={header:{id:gameId,competitions:[{id:gameId,venue:{id:'1234'},status:{type:{state:'pre',name:'STATUS_SCHEDULED'}},date:kickoffAt,competitors:[{team:{abbreviation:'DEN'}},{team:{abbreviation:'KC'}}]}]}};
test('verified indoor game produces advisory without NWS or paid API calls',async()=>{
 let nwsCalls=0;
 const r=await buildVerifiedNflWeatherReport({gameId,registryJson:JSON.stringify({[gameId]:venue}),scheduleFetcher:async()=>({ok:true,json:async()=>summary}),weatherFetcher:async()=>{nwsCalls++;throw Error('unexpected NWS call')}});
 assert.equal(r.gameId,gameId);assert.equal(r.venueId,'1234');assert.equal(r.publicationBlocked,true);assert.equal(r.paidSportsApiCalls,0);assert.equal(nwsCalls,0);
});
test('unverified ESPN stadium prevents any NWS calls',async()=>{
 let nwsCalls=0;
 await assert.rejects(()=>buildVerifiedNflWeatherReport({gameId,registryJson:JSON.stringify({[gameId]:venue}),scheduleFetcher:async()=>({ok:true,json:async()=>({...summary,header:{...summary.header,competitions:[{...summary.header.competitions[0],venue:{id:'9999'}}]}})}),weatherFetcher:async()=>{nwsCalls++;throw Error('unexpected')}}),/schedule_stadium_identity_mismatch/);
 assert.equal(nwsCalls,0);
});
