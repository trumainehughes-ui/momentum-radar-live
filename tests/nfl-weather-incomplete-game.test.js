import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNflStadiumWeather} from '../lib/nfl-weather-review.js';
test('missing kickoff with closed roof stays blocked and does not call NWS',async()=>{
 let calls=0;const r=await reviewNflStadiumWeather({gameId:'401234567',venue:{roofStatus:'closed'},fetcher:async()=>{calls++}});
 assert.equal(calls,0);assert.equal(r.assessment.status,'ROOF_UNCONFIRMED');assert.equal(r.publicationBlocked,true);
});
