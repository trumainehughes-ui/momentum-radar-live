import test from 'node:test';
import assert from 'node:assert/strict';
import {joinPlayerGameWeather} from '../lib/nfl-weather-history-join.js';
import {playerWeatherSplits} from '../lib/nfl-player-weather-splits.js';
const kickoffAt='2025-11-01T18:00:00Z';
const log={gameId:'g1',playerId:'qb1',statsSource:'NFL game log',kickoffAt,roofStatus:'outdoor',passingYards:205};
const weather={gameId:'g1',weatherSource:'NOAA observation',observedAt:'2025-11-01T18:20:00Z',kickoffAt,roofStatus:'outdoor',windMph:20,temperatureF:31,precipitationInches:0};
test('verified game and kickoff joins feed historical weather split',()=>{
 const rows=joinPlayerGameWeather({gameLogs:[log],weatherObservations:[weather]});
 assert.equal(rows.length,1);
 const result=playerWeatherSplits({playerId:'qb1',stat:'passingYards',rows});
 assert.equal(result.splits.windy.games,1);
 assert.equal(result.splits.windy.average,205);
});
test('mismatched kickoff or roof rejects historical join',()=>{
 assert.deepEqual(joinPlayerGameWeather({gameLogs:[log],weatherObservations:[{...weather,kickoffAt:'2025-11-01T19:00:00Z'}]}),[]);
 assert.deepEqual(joinPlayerGameWeather({gameLogs:[log],weatherObservations:[{...weather,roofStatus:'closed'}]}),[]);
});
test('duplicate weather observations fail closed instead of selecting convenient weather',()=>{
 assert.deepEqual(joinPlayerGameWeather({gameLogs:[log],weatherObservations:[weather,{...weather,windMph:4}]}),[]);
});
test('weather-empty rows do not consume a game before verified rows',()=>{
 const rows=[{...log,weatherSource:'NOAA',observedAt:weather.observedAt,windMph:null,temperatureF:null,precipitationInches:null},{...log,weatherSource:'NOAA',observedAt:weather.observedAt,windMph:20,temperatureF:31,precipitationInches:0}];
 const result=playerWeatherSplits({playerId:'qb1',stat:'passingYards',rows});
 assert.equal(result.splits.windy.games,1);
});
