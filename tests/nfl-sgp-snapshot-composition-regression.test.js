import test from 'node:test';
import assert from 'node:assert/strict';
import {assessNflSgpTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const mk=(cat,id)=>({cat,playerID:id});
test('Small tier rejects touchdown-heavy verified-flag candidates',()=>{
 const a=assessNflSgpTier({risk:'Small',requiredLegs:4,legs:[mk('td','1'),mk('td','2'),mk('receiving','3'),mk('rushing','4')]});
 assert.equal(a.compositionOk,false);
});
test('Medium tier requires three yardage legs',()=>{
 const a=assessNflSgpTier({risk:'Medium',requiredLegs:5,legs:[mk('td','1'),mk('receptions','2'),mk('receptions','3'),mk('receiving','4'),mk('rushing','5')]});
 assert.equal(a.compositionOk,false);
});
test('Nuke tier rejects duplicated athlete-market pairs',()=>{
 const a=assessNflSgpTier({risk:'Nuke',requiredLegs:5,legs:[mk('passing','1'),mk('rushing','2'),mk('receiving','3'),mk('receiving','3'),mk('td','4')]});
 assert.equal(a.compositionOk,false);
});
