import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNflWeather} from '../lib/nfl-weather-impact.js';
import {playerWeatherSplits} from '../lib/nfl-player-weather-splits.js';
const base={gameId:'401234567',venue:{roofStatus:'outdoor'},forecast:{source:'NWS',checkedAt:'2026-10-15T17:00:00Z',validAt:'2026-10-15T20:00:00Z',windMph:20},now:Date.parse('2026-10-15T18:00:00Z')};
test('missing kickoff prevents weather review even with otherwise fresh forecast',()=>{const r=evaluateNflWeather(base);assert.equal(r.status,'FORECAST_UNVERIFIED');assert.equal(r.weatherSgpEligible,false)});
test('minimum weather sample threshold cannot be zero, negative, or fractional',()=>{for(const minimumGames of [0,-1,1,2,2.5,101])assert.throws(()=>playerWeatherSplits({playerId:'p1',stat:'passingYards',rows:[],minimumGames}),/invalid_minimum_games/)});
