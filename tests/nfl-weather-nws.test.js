import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchNwsStadiumForecast} from '../lib/nfl-weather-nws.js';
const kickoffAt='2026-10-18T20:00:00Z';
const points={properties:{forecastHourly:'https://api.weather.gov/gridpoints/BOU/61,62/forecast/hourly'}};
const periods={properties:{periods:[{startTime:'2026-10-18T19:00:00Z',endTime:'2026-10-18T20:00:00Z',windSpeed:'5 mph',temperature:58},{startTime:'2026-10-18T20:00:00Z',endTime:'2026-10-18T21:00:00Z',windSpeed:'15 to 21 mph',temperature:43,probabilityOfPrecipitation:{value:65},shortForecast:'Rain and wind'}]}};
const response=x=>({ok:true,json:async()=>x});
test('NWS selects the hourly period containing kickoff and upper wind range',async()=>{
 const calls=[];
 const result=await fetchNwsStadiumForecast({latitude:39.7,longitude:-105,kickoffAt,now:Date.parse('2026-10-18T18:00:00Z'),fetcher:async url=>{calls.push(url);return response(calls.length===1?points:periods)}});
 assert.equal(result.windMph,21);assert.equal(result.temperatureF,43);assert.equal(result.precipProbabilityPct,65);
 assert.equal(calls.length,2);assert.equal(result.source,'National Weather Service');
});
test('NWS refuses an untrusted forecast redirect URL',async()=>{
 await assert.rejects(fetchNwsStadiumForecast({latitude:39,longitude:-105,kickoffAt,fetcher:async()=>response({properties:{forecastHourly:'https://evil.example/forecast'}})}),/untrusted_nws_forecast_url/);
});
test('NWS fails closed when kickoff period is missing',async()=>{
 await assert.rejects(fetchNwsStadiumForecast({latitude:39,longitude:-105,kickoffAt,fetcher:async url=>response(url.includes('/points/')?points:{properties:{periods:[]}})}),/nws_kickoff_period_missing/);
});
test('NWS rejects invalid stadium coordinates before network access',async()=>{
 let calls=0;
 await assert.rejects(fetchNwsStadiumForecast({latitude:100,longitude:-105,kickoffAt,fetcher:async()=>{calls++}}),/invalid_stadium_forecast_request/);
 assert.equal(calls,0);
});
