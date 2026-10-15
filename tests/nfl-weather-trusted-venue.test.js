import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveServerWeatherVenue} from '../lib/nfl-weather-trusted-venue.js';
const id='401234567';
test('server weather venue ignores caller-injected coordinates and roof',()=>{
 const trusted={roofStatus:'closed',kickoffAt:'2026-10-18T20:00:00Z'};
 const result=resolveServerWeatherVenue({gameId:id,requestVenue:{roofStatus:'outdoor',latitude:40,longitude:-100,venueSource:'fake'},registryJson:JSON.stringify({[id]:trusted})});
 assert.deepEqual(result,trusted);assert.equal(Object.isFrozen(result),true);
});
test('unconfigured weather games fail closed',()=>assert.throws(()=>resolveServerWeatherVenue({gameId:id,registryJson:'{}'}),/venue_not_configured/));
test('malformed registry fails closed',()=>assert.throws(()=>resolveServerWeatherVenue({gameId:id,registryJson:'{bad'}),/invalid_venue_registry/));
