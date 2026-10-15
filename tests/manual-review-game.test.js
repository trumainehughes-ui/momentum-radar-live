import test from 'node:test';
import assert from 'node:assert/strict';
import {manualReviewGame} from '../lib/manual-review-game.js';
test('NBA game identity uses top-level snapshot teams',()=>{
 const game=manualReviewGame('NBA','401234567',{gameId:'401234567',home:{abbr:'DEN'},away:{abbr:'LAL'},kickoff:'2026-10-16T00:00:00Z'});
 assert.equal(game.home.abbr,'DEN');assert.equal(game.away.abbr,'LAL');
});
test('NFL game identity uses nested game',()=>{
 const game=manualReviewGame('NFL','401234567',{gameId:'401234567',game:{gameId:'401234567',home:{abbr:'DEN'},away:{abbr:'LAL'}}});
 assert.equal(game.gameId,'401234567');
});
test('mismatched snapshot is rejected',()=>assert.throws(()=>manualReviewGame('NBA','401234567',{gameId:'401234568'}),/identity_mismatch/));
test('same-team mismatch is rejected',()=>assert.throws(()=>manualReviewGame('NBA','401234567',{gameId:'401234567',home:{abbr:'DEN'},away:{abbr:'DEN'}}),/metadata_missing/));
