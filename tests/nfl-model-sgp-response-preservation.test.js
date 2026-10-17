import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('completed NFL model tiers survive response assembly but remain unpriced',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/response\.sgps\.Analytics=\[\]/);
 assert.match(src,/response\.sgps\.Analytics=\(analyticsSgps\|\|\[\]\)\.filter/);
 assert.match(src,/c\.tierAssessment\?\.compositionOk===true/);
 assert.match(src,/mode:'MODEL_ONLY',publishable:false/);
 assert.match(src,/combinedBookQuoteVerified:false,actualSgpOdds:null/);
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
