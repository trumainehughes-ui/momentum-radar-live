import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNflWeather} from '../lib/nfl-weather-impact.js';
import {explainNflWeatherImpact} from '../lib/nfl-weather-explanation.js';
const base={gameId:'401234567',venue:{roofStatus:'open',kickoffAt:'2026-10-15T20:00:00Z'},forecast:{source:'NWS',checkedAt:'2026-10-15T17:00:00Z',validAt:'2026-10-15T20:00:00Z',windMph:22,gustMph:35,precipProbabilityPct:75,temperatureF:18},now:Date.parse('2026-10-15T18:00:00Z')};
test('strong wind explains passing, receiving, rushing and kicking without line changes',()=>{
 const result=explainNflWeatherImpact(evaluateNflWeather(base));
 assert.equal(result.status,'ADVISORY_ONLY');
 assert.deepEqual(result.insights.slice(0,4).map(x=>x.market),['passing_yards','receiving_yards','rushing_yards','kicking']);
 assert.equal(result.insights.find(x=>x.market==='rushing_yards').direction,'uncertain');
 assert.equal(result.playerAdjustmentsAllowed,false);
 assert.equal(result.canPublish,false);
});
test('wet and cold conditions add cautions but no fabricated adjustments',()=>{
 const result=explainNflWeatherImpact(evaluateNflWeather(base));
 assert.ok(result.insights.some(x=>x.market==='ball_security'));
 assert.ok(result.insights.some(x=>x.market==='cold_weather'));
 assert.equal(result.playerAdjustmentsAllowed,false);
});
test('unverified forecast never produces weather-adjusted picks',()=>{
 const assessment=evaluateNflWeather({...base,forecast:{...base.forecast,source:''}});
 const result=explainNflWeatherImpact(assessment);
 assert.equal(result.status,'WEATHER_UNVERIFIED');
 assert.deepEqual(result.insights,[]);
 assert.equal(result.playerAdjustmentsAllowed,false);
});
test('calm forecast has no wind-driven player adjustment',()=>{
 const assessment=evaluateNflWeather({...base,forecast:{...base.forecast,windMph:3,gustMph:5,precipProbabilityPct:10,temperatureF:65}});
 const result=explainNflWeatherImpact(assessment);
 assert.equal(result.severity,'low');
 assert.deepEqual(result.insights,[]);
 assert.equal(result.weatherSgpEligible,false);
});
