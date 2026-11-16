import test from 'node:test';
import assert from 'node:assert/strict';
import {synthesizeModelResearchTierFromCategories} from '../lib/nfl-sgp-research-synthesis.js';
const row=(name,team)=>({name,team,predictiveProjection:90,recentFive:[60,70,80,90,100],starterVerified:true,matchupVerified:true,matchupRankMost:10});
const cats={passing:[row('QB','ATL')],receiving:[row('WR','ATL')],rushing:[row('RB','BAL')],receptions:[row('TE','BAL')]};
const calibration={categoryAdjustments:{passing:.95,rushing:.95,receiving:.95,receptions:.95}};
test('requires calibration and never verifies book pricing',()=>{
 assert.equal(synthesizeModelResearchTierFromCategories('Small',cats,'401234567'),null);
 const result=synthesizeModelResearchTierFromCategories('Small',cats,'401234567',calibration);
 assert.ok(result);
 assert.equal(result.publishable,false);
 assert.equal(result.combinedOddsVerified,false);
 assert.ok(result.legs.length>=2);
});
test('rejects unverified candidates instead of converting null scores to zero',()=>{
 const unverified={passing:[{...row('QB','ATL'),starterVerified:false}]};
 assert.equal(synthesizeModelResearchTierFromCategories('Small',unverified,'401234567',calibration),null);
});
