import test from 'node:test';
import assert from 'node:assert/strict';
import {getSportsDataConfig,isSportsDataEnabled,validateSportsResearchEvidence} from '../lib/sports-data-registry.js';
test('NBA NFL MLB enabled; future leagues opt in',()=>{
 for(const league of ['NBA','NFL','MLB'])assert.equal(isSportsDataEnabled(league),true);
 for(const league of ['WNBA','NHL','NCAAF','NCAAB'])assert.equal(isSportsDataEnabled(league),false);
 assert.equal(getSportsDataConfig('UNKNOWN').ok,false);
});
test('rejects unknown, disabled and unapproved research sources',()=>{
 const e={source:'unknown',observedAt:new Date().toISOString(),records:[{id:1}]};
 assert.equal(validateSportsResearchEvidence('NBA',e).reason,'UNAPPROVED_SOURCE');
 assert.equal(validateSportsResearchEvidence('WNBA',e).reason,'LEAGUE_NOT_ENABLED');
});
test('accepts fresh approved evidence but never labels it a sportsbook quote',()=>{
 const r=validateSportsResearchEvidence('NFL',{source:'espn',observedAt:new Date().toISOString(),records:[{id:'game'}]});
 assert.equal(r.ok,true);assert.equal(r.sportsbookVerified,false);
});
test('rejects stale, missing and empty records',()=>{
 assert.equal(validateSportsResearchEvidence('MLB',{source:'mlb_official',observedAt:'2020-01-01',records:[1]}).reason,'STALE_OR_FUTURE_EVIDENCE');
 assert.equal(validateSportsResearchEvidence('MLB',{source:'mlb_official',observedAt:new Date().toISOString(),records:[]}).reason,'EMPTY_RECORDS');
});
