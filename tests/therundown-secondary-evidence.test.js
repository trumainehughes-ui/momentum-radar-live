import test from 'node:test';
import assert from 'node:assert/strict';
import {supplementalGameEvidence,canPublishBookSgp} from '../lib/therundown-secondary-evidence.js';
test('TheRundown game context never becomes sportsbook prop or SGP quote',()=>{
 const evidence=supplementalGameEvidence([{event_id:'123',home_team:'Home',away_team:'Away',start_time:'2026-10-20T00:15:00Z'}],'nfl');
 assert.equal(evidence.games.length,1);
 assert.deepEqual(evidence.playerPropOffers,[]);
 assert.deepEqual(evidence.combinedSgpQuotes,[]);
 assert.equal(evidence.publishable,false);
 assert.equal(evidence.combinedBookQuoteVerified,false);
});
test('unverified or model-only SGPs fail closed',()=>{
 const base={book:'DraftKings',combinedBookQuoteVerified:true,tierVerified:true,publishable:true,
 actualSgpOdds:10000,quotedAt:new Date().toISOString(),legs:[{bookOffer:{verified:true}}]};
 assert.equal(canPublishBookSgp({...base,book:'Data Model'}),false);
 assert.equal(canPublishBookSgp({...base,combinedBookQuoteVerified:false}),false);
 assert.equal(canPublishBookSgp({...base,actualSgpOdds:null}),false);
 assert.equal(canPublishBookSgp({...base,legs:[{bookOffer:{verified:false}}]}),false);
 assert.equal(canPublishBookSgp({...base,quotedAt:'2020-01-01T00:00:00Z'}),false);
 assert.equal(canPublishBookSgp(base),true);
});
