import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBookSgp } from '../lib/validate-book-sgp.mjs';

const now = Date.parse('2026-10-16T12:00:00Z');
const observedAt = new Date(now - 60_000).toISOString();
const leg = (line) => ({playerId:'bijan-id',gameId:'bears-falcons',market:'rushing',threshold:line});
const offer = (line,book='FanDuel') => ({playerId:'bijan-id',gameId:'bears-falcons',market:'rushing',line,book,priceAmerican:300,observedAt,verified:true});
const quote = {verified:true,book:'FanDuel',priceAmerican:26352,observedAt,allLegsAccepted:true};
test('rejects 135+ when verified ladder has 125+ and 150+ only', () => {
 const result=validateBookSgp({legs:[leg(135)],combinedQuote:quote},'FanDuel',[offer(125),offer(150)],now);
 assert.equal(result.publishable,false);
 assert.equal(result.verifiedLegCount,0);
 assert.ok(result.reasons.includes('LEG_1_EXACT_OFFER_NOT_VERIFIED'));
});
test('does not silently round 135+ to 125+ or 150+', () => {
 const result=validateBookSgp({legs:[leg(135)],combinedQuote:quote},'FanDuel',[offer(125),offer(150)],now);
 assert.equal(result.legs[0].offer,null);
});
test('rejects other sportsbook offer', () => {
 const result=validateBookSgp({legs:[leg(125)],combinedQuote:quote},'FanDuel',[offer(125,'DraftKings')],now);
 assert.equal(result.publishable,false);
});
test('requires verified combined SGP quote', () => {
 const result=validateBookSgp({legs:[leg(125)]},'FanDuel',[offer(125)],now);
 assert.equal(result.publishable,false);
 assert.ok(result.reasons.includes('COMBINED_BOOK_QUOTE_NOT_VERIFIED'));
});
test('accepts exact verified offer and verified combined quote', () => {
 const result=validateBookSgp({legs:[leg(125)],combinedQuote:quote},'FanDuel',[offer(125)],now);
 assert.equal(result.publishable,false);
});
test('rejects stale offers', () => {
 const stale={...offer(125),observedAt:new Date(now-31*60_000).toISOString()};
 const result=validateBookSgp({legs:[leg(125)],combinedQuote:quote},'FanDuel',[stale],now);
 assert.equal(result.publishable,false);
});

test('accepts exact fractional sportsbook thresholds', () => {
 const result=validateBookSgp({legs:[leg(64.5)],combinedQuote:quote},'FanDuel',[offer(64.5)],now);
 assert.equal(result.publishable,true);
});
test('rejects missing or zero-priced individual offers', () => {
 for (const priceAmerican of [null,undefined,'',0]) {
  const result=validateBookSgp({legs:[leg(125)],combinedQuote:quote},'FanDuel',[{...offer(125),priceAmerican}],now);
  assert.equal(result.publishable,false);
 }
});
test('rejects missing or zero-priced combined quote', () => {
 for (const priceAmerican of [null,undefined,'',0]) {
  const result=validateBookSgp({legs:[leg(125)],combinedQuote:{...quote,priceAmerican}},'FanDuel',[offer(125)],now);
  assert.equal(result.publishable,false);
 }
});

test('rejects cross-game selections inside one SGP', () => {
 const second={...leg(125),gameId:'different-game',playerId:'second-player'};
 const secondOffer={...offer(125),gameId:'different-game',playerId:'second-player'};
 const result=validateBookSgp({legs:[leg(125),second],combinedQuote:quote},'FanDuel',[offer(125),secondOffer],now);
 assert.equal(result.publishable,false);
 assert.ok(result.reasons.includes('MULTIPLE_GAMES_IN_SGP'));
});

test('publishes only multi-leg SGP with matching quote selection IDs', () => {
 const first={...leg(125),playerId:'player-a'};
 const second={...leg(64.5),playerId:'player-b'};
 const a={...offer(125),playerId:'player-a',offerId:'selection-a'};
 const b={...offer(64.5),playerId:'player-b',offerId:'selection-b'};
 const sgp={legs:[first,second],combinedQuote:{...quote,legIds:['selection-b','selection-a']}};
 assert.equal(validateBookSgp(sgp,'FanDuel',[a,b],now).publishable,true);
 assert.equal(validateBookSgp({...sgp,combinedQuote:{...quote,legIds:['selection-a','different']}},'FanDuel',[a,b],now).publishable,false);
});

test('missing source offer line never matches a zero-threshold selection', () => {
 const zeroLeg={...leg(0)};
 for (const line of [null,undefined,'']) {
  const candidate={...offer(0),line};
  const result=validateBookSgp({legs:[zeroLeg],combinedQuote:quote},'FanDuel',[candidate],now);
  assert.equal(result.verifiedLegCount,0);
 }
});
