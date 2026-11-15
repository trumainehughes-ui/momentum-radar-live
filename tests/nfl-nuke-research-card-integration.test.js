import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNflProjectedSgpTierDetails} from '../lib/nfl-sgp-model-yardage-cards.js';

test('Nuke research card uses model-derived target without implying sportsbook verification',()=>{
 const gameId='401873054',date='2026-11-15';
 const market={
  ok:true,scope:'game',gameId,date,home:'NYJ',away:'BUF',
  categories:{receiving:[{name:'Test Receiver',team:'BUF',position:'WR',projection:80,gamesPlayed:10}]},
  sgps:{Analytics:[{risk:'Nuke',legs:[{player:'Test Receiver',team:'BUF',category:'receiving',gameId}]}]}
 };
 const result=buildNflProjectedSgpTierDetails({market,gameId,date,home:'NYJ',away:'BUF'});
 const nuke=result.tiers.find(t=>t.risk==='Nuke');
 assert.equal(result.bookmakerSgpQuoteVerified,false);
 assert.equal(nuke.legs.length,1);
 assert.equal(nuke.legs[0].mainTarget,95);
 assert.equal(nuke.legs[0].thresholdBasis,'MODEL_DERIVED_UNVERIFIED');
 assert.equal(nuke.legs[0].publishable,false);
 assert.equal(nuke.legs[0].modelOnly,true);
 assert.equal(nuke.compositionComplete,false);
});
