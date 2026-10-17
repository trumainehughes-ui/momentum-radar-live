import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateNflBookQuoteReadiness} from '../lib/nfl-book-quote-readiness.js';
const now=Date.parse('2026-10-11T15:00:00Z');
const gameId='401872990',eventId='872990';
const mk=(risk='Small',n=4,book='DraftKings')=>({
 risk,requiredLegs:n,tierAssessment:{compositionOk:true},legs:
 Array.from({length:n},(_,i)=>({
  eventID:gameId,providerEventId:eventId,playerID:'athlete-'+i,
  name:'Player '+i,cat:i===0?'passing':i===1?'rushing':'receiving',
  bookOffer:{book,sourceProvider:'PropLine',available:true,
   sourceUrl:'https://prop-line.com',checkedAt:new Date(now-1000).toISOString(),
   marketKey:i===0?'player_pass_yds':i===1?'player_rush_yds':'player_reception_yds',
   bookOutcomeId:book+'-selection-'+i,odds:i%2?-120:130}
 }))
});
const check=(candidate,book='DraftKings')=>evaluateNflBookQuoteReadiness(
 candidate,{book,gameId,now});
const altered=(fn,risk='Small',n=4)=>{
 const c=mk(risk,n);fn(c);return c;
};
test('a valid Small Medium and Nuke quote preflight preserves exact provider ids',()=>{
 for(const [risk,count] of [['Small',4],['Medium',5],['Nuke',7],['Nuke',5]]){
  const c=mk(risk,count),out=check(c);
  assert.equal(out.eligible,true,risk);
  assert.equal(out.reason,'READY_FOR_AUTHORIZED_QUOTE');
  assert.equal(out.eventId,eventId);
  assert.equal(out.selectionCount,count);
  assert.deepEqual(out.quoteRequest.legs,c.legs.map(l=>({
   market:l.bookOffer.marketKey,book_outcome_id:l.bookOffer.bookOutcomeId
  })));
  assert.equal(out.quoteRequest.risk,risk);
  assert.equal(out.quoteRequest.bookmaker,'draftkings');
 }
});
test('one missing or unauthorized sportsbook selection cannot trigger a paid quote',()=>{
 const cases=[
  [c=>{c.legs[2].bookOffer.sourceProvider='The Odds API'},'MISSING_PROPLINE_BOOK_OFFER'],
  [c=>{c.legs[2].bookOffer.book='FanDuel'},'MISSING_PROPLINE_BOOK_OFFER'],
  [c=>{c.legs[2].bookOffer.available=false},'MISSING_PROPLINE_BOOK_OFFER'],
  [c=>{c.legs[2].bookOffer=null},'MISSING_PROPLINE_BOOK_OFFER'],
  [c=>{c.legs[1].eventID='401872988'},'CROSS_GAME_BOOK_SELECTIONS'],
  [c=>{c.legs[2].providerEventId='872999'},'CROSS_PROVIDER_EVENT_SELECTIONS'],
  [c=>{c.legs[2].providerEventId=''},'MISSING_PROVIDER_EVENT_ID'],
  [c=>{c.legs[2].bookOffer.bookOutcomeId=null},'MISSING_VERIFIED_BOOK_SELECTIONS'],
  [c=>{c.legs[2].bookOffer.marketKey='not_real'},'MISSING_VERIFIED_BOOK_SELECTIONS'],
  [c=>{c.legs[2].bookOffer.checkedAt=null},'STALE_OR_UNDATED_BOOK_SELECTION'],
  [c=>{c.legs[2].bookOffer.checkedAt=new Date(now-16*60_000).toISOString()},'STALE_OR_UNDATED_BOOK_SELECTION'],
  [c=>{c.legs[2].bookOffer.checkedAt=new Date(now+61_000).toISOString()},'STALE_OR_UNDATED_BOOK_SELECTION'],
  [c=>{c.legs[2].bookOffer.odds=0},'MISSING_BOOK_OFFER_PRICE'],
  [c=>{c.legs[2].bookOffer.bookOutcomeId=c.legs[1].bookOffer.bookOutcomeId;
         c.legs[2].bookOffer.marketKey=c.legs[1].bookOffer.marketKey},'DUPLICATE_BOOK_SELECTION']
 ];
 for(const [mutate,reason] of cases){
  const c=altered(mutate),r=check(c);
  assert.equal(r.eligible,false,reason);
  assert.equal(r.reason,reason);
  assert.equal(r.quoteRequest,null);
  assert.deepEqual(r.selections,[]);
  assert.equal(r.selectionCount,0);
 }
});
test('a bad parlay construction is never eligible regardless of valid individual selections',()=>{
 for(const c of [
  altered(c=>{c.requiredLegs=3}),
  altered(c=>{c.tierAssessment.compositionOk=false}),
  altered(c=>{c.legs=c.legs.slice(1)}),
  mk('Nuke',4),
  mk('Medium',4)
 ]){
  const r=check(c);
  assert.equal(r.eligible,false);
  assert.equal(r.reason,'INCOMPLETE_OR_UNQUALIFIED_BOOK_TIER');
 }
 assert.equal(check(null).reason,'INVALID_QUOTE_GAME_OR_TIER');
});
test('FanDuel IDs cannot be accidentally quoted as DraftKings',()=>{
 const c=mk('Small',4,'FanDuel');
 assert.equal(check(c,'DraftKings').reason,'MISSING_PROPLINE_BOOK_OFFER');
 const good=check(c,'FanDuel');
 assert.equal(good.eligible,true);
 assert.equal(good.quoteRequest.bookmaker,'fanduel');
});
test('production strictly gates every book candidate before signed change quote call',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('evaluateNflBookQuoteReadiness(s,{book,gameId,now})'));
 assert.ok(src.includes('quoteEligibility:!preflight.eligible?preflight.reason'));
 assert.ok(src.includes('quoteSelectionCount:preflight.eligible&&lineup.ready?preflight.selectionCount:0'));
 assert.ok(src.includes('quoteRequest:safeQuote'));
 assert.ok(src.includes("s.quoteEligibility==='READY_FOR_AUTHORIZED_QUOTE'&&s.quoteRequest"));
 assert.ok(src.includes('if(authorizedChange&&gameId&&!DIRECT_PUBLIC_ODDS_ONLY)'));
 assert.ok(src.includes('candidates.slice(0,6)'));
});
