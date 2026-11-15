import test from 'node:test';
import assert from 'node:assert/strict';
import {assessNflSgpTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
import {publishedNflModelTier} from '../lib/nfl-public-model-sgp-serializer.js';

const leg=(id,cat)=>({name:'Player '+id,playerID:String(id),team:'DEN',cat,
 eventID:'401873061',analyticsThreshold:cat==='td'?1:55});
const fixtures={
 Small:[leg(1,'passing'),leg(2,'rushing'),leg(3,'receptions')],
 Medium:[leg(1,'passing'),leg(2,'rushing'),leg(3,'receiving'),leg(4,'receptions')],
 Large:[leg(1,'passing'),leg(2,'rushing'),leg(3,'receiving'),leg(4,'receptions'),leg(5,'td')],
 Nuke:[leg(1,'passing'),leg(2,'rushing'),leg(3,'receiving'),leg(4,'receptions'),leg(5,'td'),leg(6,'receiving'),leg(7,'rushing')]
};
for(const [risk,legs] of Object.entries(fixtures)){
 test(risk+' valid model ticket is never a verified sportsbook quote',()=>{
  const tierAssessment=assessNflSgpTier({risk,legs,requiredLegs:legs.length});
  assert.equal(tierAssessment.compositionOk,true);
  const published=publishedNflModelTier({risk,legs,requiredLegs:legs.length,tierAssessment});
  assert.ok(published);
  assert.equal(published.legs.length,legs.length);
  assert.equal(published.publishable,false);
  assert.equal(published.combinedBookQuoteVerified,false);
  assert.equal(published.actualSgpOdds,null);
  assert.ok(published.legs.every(x=>x.marketSelectionStatus==='NO_EXACT_DRAFTKINGS_OR_FANDUEL_OFFER'));
 });
}
test('empty Nuke and invalid Small cannot be serialized as model tickets',()=>{
 assert.equal(publishedNflModelTier({risk:'Nuke',legs:[],requiredLegs:0,tierAssessment:{compositionOk:true}}),null);
 const legs=[leg(1,'passing'),leg(2,'rushing'),leg(3,'receiving'),leg(4,'receptions')];
 assert.equal(publishedNflModelTier({risk:'Small',legs,requiredLegs:4,tierAssessment:{compositionOk:true}}),null);
});
