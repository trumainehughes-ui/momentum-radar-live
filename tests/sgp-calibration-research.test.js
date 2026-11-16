import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseAndCalibrateHistory,calibratedTierThreshold,assessSlipCorrelation} from '../lib/sgp-calibration-research.js';
const game={finalVerified:true,lockedAt:'2026-11-15T17:00:00Z',kickoffAt:'2026-11-15T18:00:00Z',picks:[{category:'receiving',direction:'over',grade:{actual:40,target:50,projectionAtLock:65,sourceVerified:true}}]};
test('excludes unverified finals and avoids small-sample calibration',()=>{
 const result=diagnoseAndCalibrateHistory([game,{...game,finalVerified:false}]);
 assert.equal(result.categories.receiving.misses,1);
 assert.equal(result.exclusions.unverified,1);
 assert.equal(result.categoryAdjustments.receiving,null);
 assert.equal(result.publishable,false);
});
test('verified negative bias can lower research projection',()=>{
 const out=diagnoseAndCalibrateHistory(Array.from({length:20},()=>game));
 assert.ok(out.categoryAdjustments.receiving<1);
});
test('threshold requires real starter, matchup and five-game evidence',()=>{
 const player={predictiveProjection:90,recentFive:[60,70,80,90,100],starterVerified:true,matchupVerified:true,matchupRankMost:10};
 const calibration={categoryAdjustments:{receiving:0.95}};
 assert.equal(calibratedTierThreshold(player,'receiving','Small',calibration),55);
 assert.equal(calibratedTierThreshold({...player,starterVerified:false},'receiving','Small',calibration),null);
});
test('game-script conflicts trigger review rather than unsupported automatic rejection',()=>{
 const result=assessSlipCorrelation({team:'ATL',category:'rushing'},[{team:'ATL',category:'passing'}],'Nuke');
 assert.equal(result.allowed,true);
 assert.deepEqual(result.warnings,['REVIEW_PASS_RUSH_GAME_SCRIPT']);
});
