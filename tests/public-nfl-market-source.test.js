import test from 'node:test';
import assert from 'node:assert/strict';
import {publicNflMarketSourcePolicy} from '../lib/public-nfl-market-source.js';
test('public NFL source disclosure defaults closed and does not claim priced SGPs',()=>{
 const p=publicNflMarketSourcePolicy({});
 assert.equal(p.verifiedBookFeedsEnabled,false);
 assert.equal(p.combinedSgpRequiresBookIssuedQuote,true);
 assert.equal(p.modelOnlyCandidatesAreNotBettable,true);
});
test('public NFL disclosure matches explicit verified feed opt-in',()=>{
 const p=publicNflMarketSourcePolicy({MOMENTUM_VERIFIED_BOOK_FEEDS:'enabled'});
 assert.equal(p.verifiedBookFeedsEnabled,true);
 assert.deepEqual(p.preferredBooks,['DraftKings','FanDuel']);
});
