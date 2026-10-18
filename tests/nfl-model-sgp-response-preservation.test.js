import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('completed NFL model tiers survive response assembly but remain unpriced',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const serializer=readFileSync(new URL('../lib/nfl-public-model-sgp-serializer.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/response\.sgps\.Analytics=\[\]/);
 assert.match(src,/response\.sgps\.Analytics=\(analyticsSgps\|\|\[\]\)\.filter/);
 assert.match(src,/c\.tierAssessment\?\.compositionOk===true/);
 assert.match(serializer,/mode:'MODEL_ONLY',publishable:false/);
 assert.match(serializer,/combinedBookQuoteVerified:false,actualSgpOdds:null/);
 assert.match(src,/safeTeams\.has\(String\(l\.team/);
 assert.match(src,/MODEL_ONLY_RESEARCH/);
});

test('cached NFL SGP response does not reference an undefined response or erase model tiers',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const cached=src.split('function nflVerifiedOnlySgpResponse(body){')[1].split('async function readResponseSnapshot(')[0];
 assert.doesNotMatch(cached,/response\.sgps/);
 assert.doesNotMatch(cached,/sgps\.Analytics=\[\]/);
 assert.match(cached,/sgps\.Analytics=\(Array\.isArray\(sgps\.Analytics\)/);
});

test('cached touchdown SGP legs do not require a numeric yardage threshold',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const cached=src.split('function nflVerifiedOnlySgpResponse(body){')[1].split('async function readResponseSnapshot(')[0];
 assert.match(cached,/c\.legs\.every\(l=>l\?\.player&&l\?\.team&&l\?\.category\)/);
 assert.match(cached,/target:null/);
 assert.match(cached,/marketSelectionStatus:'NO_EXACT_DRAFTKINGS_OR_FANDUEL_OFFER'/);
});

test('model SGP publication requires checked current roster and injury holds',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const publish=src.split('const safeTeams=new Set(')[1].split('response.sgps.mode=')[0];
 assert.match(publish,/eligibility.checked===true/);
 assert.match(publish,/eligibility.rosterById\?\.get\(id\)/);
 assert.match(publish,/nflCanonTeam\(roster.team\)===nflCanonTeam\(l.team\)/);
 assert.match(publish,/!eligibility.blockedIds.has\(id\)/);
 assert.match(publish,/!eligibility.blockedNames.has\(norm\(l.name\)\)/);
});

test('roster hard-gate changes the NFL market cache schema',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(src,/const CACHE_SCHEMA=[^;]*roster-hardgate-v1/);
});
