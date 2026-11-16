import test from 'node:test';
import assert from 'node:assert/strict';
import {calibratedTierThreshold,scoreCandidateForTier,isCorrelatedWithSlip,rankVerifiedNflSgpCandidates} from '../lib/nfl-sgp-autocorrect.js';
const player={predictiveProjection:90,recentFive:[60,70,80,90,100],starterVerified:true,matchupVerified:true,matchupRankMost:10,team:'ATL',category:'receiving'};
const calibration={categoryAdjustments:{receiving:0.95}};
test('autocorrect requires validated calibration and starter/matchup evidence',()=>{
 assert.equal(calibratedTierThreshold(player,'receiving','Small',calibration),60);
 assert.equal(calibratedTierThreshold(player,'receiving','Small'),null);
 assert.equal(scoreCandidateForTier({...player,starterVerified:false},'receiving','Small',calibration),null);
});
test('correlation warnings block automatic compatibility selection',()=>{
 assert.equal(isCorrelatedWithSlip({team:'ATL',cat:'rushing'},[{team:'ATL',cat:'passing'}],'Nuke'),false);
 assert.equal(isCorrelatedWithSlip({team:'ATL',cat:'rushing'},[{team:'ATL',cat:'passing'}],'Small'),true);
});
test('ranker excludes unsupported candidates rather than inventing probabilities',()=>{
 const ranked=rankVerifiedNflSgpCandidates([player,{...player,starterVerified:false}],'receiving','Small',calibration);
 assert.equal(ranked.length,1);
 assert.ok(ranked[0].score>0);
});
