import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNflStadiumWeather} from '../lib/nfl-weather-review.js';
const now=Date.parse('2026-10-18T18:00:00Z');
const venue={roofStatus:'outdoor',latitude:39.7,longitude:-105,kickoffAt:'2026-10-18T20:00:00Z'};
const points={properties:{forecastHourly:'https://api.weather.gov/gridpoints/BOU/61,62/forecast/hourly'}};
const hourly={properties:{periods:[{startTime:'2026-10-18T20:00:00Z',endTime:'2026-10-18T21:00:00Z',windSpeed:'22 mph',temperature:40,probabilityOfPrecipitation:{value:55}}]}};
test('NWS forecast flows into weather severity and AI advisory without sportsbook calls',async()=>{
 const calls=[];
 const result=await reviewNflStadiumWeather({gameId:'401234567',venue,now,fetcher:async url=>{calls.push(url);return {ok:true,json:async()=>calls.length===1?points:hourly}}});
 assert.equal(calls.length,2);assert.equal(result.assessment.status,'FORECAST_REVIEWED');
 assert.equal(result.assessment.severity,'high');assert.equal(result.explanation.status,'ADVISORY_ONLY');
 assert.equal(result.paidSportsApiCalls,0);assert.equal(result.publicationBlocked,true);
});
test('closed-roof stadium does not make weather network calls',async()=>{
 let calls=0;const result=await reviewNflStadiumWeather({gameId:'401234567',venue:{...venue,roofStatus:'closed'},now,fetcher:async()=>{calls++;throw Error('should not call')}});
 assert.equal(calls,0);assert.equal(result.assessment.status,'INDOOR');
});
test('NWS network failure results in no weather-adjusted picks',async()=>{
 const result=await reviewNflStadiumWeather({gameId:'401234567',venue,now,fetcher:async()=>{throw Error('network unavailable')}});
 assert.equal(result.assessment.status,'FORECAST_UNVERIFIED');assert.equal(result.explanation.playerAdjustmentsAllowed,false);
});
test('unknown roof status cannot trigger forecast fetch',async()=>{
 let calls=0;const result=await reviewNflStadiumWeather({gameId:'401234567',venue:{...venue,roofStatus:'unknown'},now,fetcher:async()=>{calls++}});
 assert.equal(calls,0);assert.equal(result.assessment.status,'ROOF_UNCONFIRMED');
});
