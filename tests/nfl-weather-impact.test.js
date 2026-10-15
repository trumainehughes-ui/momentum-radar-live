import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNflWeather} from '../lib/nfl-weather-impact.js';
const now=Date.parse('2026-10-15T18:00:00Z');
const base={gameId:'401234567',venue:{roofStatus:'outdoor',kickoffAt:'2026-10-15T20:00:00Z'},forecast:{source:'NWS',checkedAt:'2026-10-15T17:00:00Z',validAt:'2026-10-15T20:00:00Z',windMph:18,gustMph:26,precipProbabilityPct:40,temperatureF:42},now};
test('outdoor wind flags weather SGP review but never publishes',()=>{const r=evaluateNflWeather(base);assert.equal(r.severity,'elevated');assert.equal(r.weatherSgpEligible,true);assert.equal(r.canPublish,false);assert.equal(r.weather.source,'NWS')});
test('closed roof bypasses outdoor weather impacts',()=>{const r=evaluateNflWeather({...base,venue:{roofStatus:'closed'}});assert.equal(r.status,'INDOOR');assert.equal(r.weatherSgpEligible,false)});
test('unknown retractable roof is not assumed open',()=>{const r=evaluateNflWeather({...base,venue:{roofStatus:'unknown'}});assert.equal(r.status,'ROOF_UNCONFIRMED')});
test('stale forecast blocks weather SGP',()=>{const r=evaluateNflWeather({...base,forecast:{...base.forecast,checkedAt:'2026-10-14T12:00:00Z'}});assert.equal(r.status,'FORECAST_UNVERIFIED');assert.equal(r.weatherSgpEligible,false)});
test('kickoff misaligned forecast is blocked',()=>{const r=evaluateNflWeather({...base,forecast:{...base.forecast,validAt:'2026-10-16T12:00:00Z'}});assert.equal(r.status,'FORECAST_UNVERIFIED')});
test('calm conditions do not trigger inclement weather SGP',()=>{const r=evaluateNflWeather({...base,forecast:{...base.forecast,windMph:4,gustMph:6}});assert.equal(r.severity,'low');assert.equal(r.weatherSgpEligible,false)});
test('extreme gusts trigger high weather review',()=>{const r=evaluateNflWeather({...base,forecast:{...base.forecast,windMph:8,gustMph:32}});assert.equal(r.severity,'high')});
test('missing source or forecast wind fails closed',()=>{for(const forecast of [{...base.forecast,source:''},{...base.forecast,windMph:null}])assert.equal(evaluateNflWeather({...base,forecast}).status,'FORECAST_UNVERIFIED')});

test('forecast period must include kickoff if supplied',()=>{
 const before={...base.forecast,forecastPeriodStart:'2026-10-15T18:00:00Z',forecastPeriodEnd:'2026-10-15T19:00:00Z'};
 assert.equal(evaluateNflWeather({...base,forecast:before}).status,'FORECAST_UNVERIFIED');
 const containing={...before,forecastPeriodEnd:'2026-10-15T21:00:00Z'};
 assert.equal(evaluateNflWeather({...base,forecast:containing}).status,'FORECAST_REVIEWED');
});
