import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('all NFL SGP selection paths reject unconfirmed high-usage players',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/role\.gameModelOnly===true&&role\.starterStatus==='PROJECTED_HIGH_USAGE_ROLE'/);
 assert.doesNotMatch(src,/role\?\.gameModelOnly===true&&role\?\.starterStatus==='PROJECTED_HIGH_USAGE_ROLE'/);
 assert.match(src,/role\.starterVerified===true&&String\(role\.starterStatus\|\|''\)\.toUpperCase\(\)==='CONFIRMED_STARTER'/);
 assert.match(src,/r\.recommendationEligible!==true\|\|r\.starterVerified!==true\|\|r\.verification\?\.role\?\.verified!==true/);
});
