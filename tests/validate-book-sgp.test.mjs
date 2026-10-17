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
 assert.equal(result.publishable,true);
});
test('rejects stale offers', () => {
 const stale={...offer(125),observedAt:new Date(now-31*60_000).toISOString()};
 const result=validateBookSgp({legs:[leg(125)],combinedQuote:quote},'FanDuel',[stale],now);
 assert.equal(result.publishable,false);
});
