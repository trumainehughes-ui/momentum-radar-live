import test from 'node:test';
import assert from 'node:assert/strict';
import {canPublishBookSgp} from '../lib/therundown-secondary-evidence.js';
const now=Date.parse('2026-10-19T18:00:00Z');
const quote={book:'DraftKings',combinedBookQuoteVerified:true,tierVerified:true,
 publishable:true,actualSgpOdds:2500,quotedAt:new Date(now-60_000).toISOString(),
 legs:[{bookOffer:{verified:true}}]};
test('quote uses provided audit time',()=>assert.equal(canPublishBookSgp(quote,{now}),true));
test('quote expires after fifteen minutes',()=>assert.equal(canPublishBookSgp(quote,{now:now+16*60_000}),false));
test('future-dated quote is rejected',()=>assert.equal(canPublishBookSgp(quote,{now:now-2*60_000}),false));
test('unverified individual sportsbook offer is rejected',()=>assert.equal(canPublishBookSgp({...quote,legs:[{bookOffer:{verified:false}}]},{now}),false));
