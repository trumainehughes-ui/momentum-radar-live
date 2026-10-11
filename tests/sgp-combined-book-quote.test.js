import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLeagueBookCombinedQuote} from '../lib/sgp-combined-book-quote.js';
import {auditLeagueSgpEvent} from '../lib/sgp-league-wide-verification.js';

const at=Date.parse('2026-10-11T13:00:00Z');
const game='401872981',book='FanDuel',league='nfl';
const legs=[
 {name:'Quarterback A',playerID:'11',team:'JAX',eventID:game,cat:'passing',analyticsThreshold:180},
 {name:'Runner B',playerID:'22',team:'JAX',eventID:game,cat:'rushing',analyticsThreshold:65},
 {name:'Receiver C',playerID:'33',team:'PHI',eventID:game,cat:'receiving',analyticsThreshold:60},
 {name:'Scorer D',playerID:'44',team:'PHI',eventID:game,cat:'td',analyticsThreshold:'Anytime TD'}
];
const quote=(overrides={})=>({
 league,book,gameId:game,sourceType:'BOOK_ISSUED_COMBINED_SGP',
 providerQuoteId:'book-offer-100',americanOdds:2400,
 sourceQuoteAt:new Date(at-20_000).toISOString(),legs:[...legs].reverse(),
 ...overrides
});
const validate=(q=quote(),extra={})=>verifyLeagueBookCombinedQuote({
 league,book,gameId:game,risk:'Small',legs,quote:q,
 providerAuthenticated:true,now:at,...extra
});
const card=(risk='Small',event=game,l=legs)=>({
 risk,legs:l,requiredLegs:l.length,tierAssessment:{compositionOk:true},
 bookMarketAudits:{FanDuel:{
  gameId:event,book:'FanDuel',requestedTier:risk,totalLegs:l.length,
  matchedLegs:l.length,allLegsMatched:true,missingLegs:[]
 }}
});
test('authenticated live bookstore-correlated +2400 Small quote yields $240 NET for $10 wager',()=>{
 const r=validate();
 assert.equal(r.verified,true);
 assert.equal(r.tierVerified,true);
 assert.equal(r.observedTier,'Small');
 assert.equal(r.actualNetProfit,240);
 assert.equal(r.actualTotalReturn,250);
 assert.equal(r.notGuaranteedAtPlacement,true);
});
test('screenshot Medium +975 is a real price OUTSIDE Medium, not a tier verification',()=>{
 const r=validate(quote({americanOdds:975}),{risk:'Medium'});
 assert.equal(r.verified,true);
 assert.equal(r.tierVerified,false);
 assert.equal(r.observedTier,'OUTSIDE_TIER_BANDS');
 assert.equal(r.actualNetProfit,97.5);
});
test('screenshots, snippets, multiplications and AI cannot impersonate bookmaker-issued correlated quotes',()=>{
 assert.equal(validate(quote(),{providerAuthenticated:false}).verified,false);
 for(const sourceType of ['MODEL_INDEPENDENT_MULTIPLICATION','PUBLIC_WEB_SNIPPET','USER_SCREENSHOT','AI_ESTIMATE']){
  assert.equal(validate(quote({sourceType})).verified,false,sourceType);
 }
 assert.equal(validate(quote({providerQuoteId:null})).verified,false);
});
test('change of player, category, threshold, book, event, or league fails closed',()=>{
 const variants=[
  quote({gameId:'401872982'}),quote({league:'nba'}),quote({book:'DraftKings'}),
  quote({legs:legs.map((x,i)=>i===0?{...x,playerID:'999'}:x)}),
  quote({legs:legs.map((x,i)=>i===0?{...x,name:'Wrong Name'}:x)}),
  quote({legs:legs.map((x,i)=>i===0?{...x,analyticsThreshold:175}:x)}),
  quote({legs:legs.map((x,i)=>i===0?{...x,cat:'rushing'}:x)}),
  quote({legs:legs.map((x,i)=>i===0?{...x,eventID:'401872982'}:x)}),
  quote({legs:legs.slice(1)}),quote({legs:[legs[0],legs[0],legs[2],legs[3]]})
 ];
 for(const q of variants)assert.equal(validate(q).verified,false,JSON.stringify(q).slice(0,130));
});
test('stale, future, malformed and unsigned prices never pass the 15-minute freshness gate',()=>{
 for(const when of [null,'n/a',new Date(at-16*60*1000).toISOString(),new Date(at+1).toISOString()]){
  assert.equal(validate(quote({sourceQuoteAt:when})).verified,false,String(when));
 }
 for(const odds of [null,NaN,-110,0,2.5,'2400',Infinity]){
  assert.equal(validate(quote({americanOdds:odds})).verified,false,String(odds));
 }
});
test('tier classification is exactly Small +2000..3000, Medium +3001..8000, Nuke +10000+',()=>{
 for(const [odds,risk,expected] of [
  [1999,'Small',false],[2000,'Small',true],[3000,'Small',true],
  [3001,'Medium',true],[8000,'Medium',true],[8001,'Medium',false],
  [10000,'Nuke',true],[25362,'Nuke',true]]){
  const r=validate(quote({americanOdds:odds}),{risk});
  assert.equal(r.tierVerified,expected,odds+' '+risk);
 }
});
test('event-wide verification requires authenticated quote AND all exact book-leg markets',()=>{
 const s=card();
 const first=auditLeagueSgpEvent({
  league:'nfl',gameId:game,sgps:{Analytics:[s]},
  bookIssuedQuotes:{FanDuel:{Small:quote()}},now:at
 });
 assert.equal(first.sportsbookVerifiedCount,0);
 const correct=auditLeagueSgpEvent({
  league:'nfl',gameId:game,sgps:{Analytics:[s]},
  bookIssuedQuotes:{FanDuel:{Small:quote()}},quoteAdapterAuthenticated:true,now:at
 });
 assert.equal(correct.tiers[0].books.FanDuel.status,'TIER_COMBINED_QUOTE_VERIFIED');
 assert.equal(correct.tiers[0].books.FanDuel.actualCombinedOdds,2400);
 assert.equal(correct.sportsbookVerifiedCount,1);
 assert.equal(correct.allThreeBookmakerVerified,false);
 const mismatched=card();
 mismatched.bookMarketAudits.FanDuel.allLegsMatched=false;
 mismatched.bookMarketAudits.FanDuel.matchedLegs=3;
 const nope=auditLeagueSgpEvent({
  league:'nfl',gameId:game,sgps:{Analytics:[mismatched]},
  bookIssuedQuotes:{FanDuel:{Small:quote()}},quoteAdapterAuthenticated:true,now:at
 });
 assert.equal(nope.tiers[0].books.FanDuel.status,'BOOK_LEG_MISMATCH');
 assert.equal(nope.sportsbookVerifiedCount,0);
});
test('genuine bookmaker +975 cannot be displayed as verified Medium and remains correct audit',()=>{
 const model=card('Medium');
 const a=auditLeagueSgpEvent({league:'nfl',gameId:game,sgps:{Analytics:[model]},
  quoteAdapterAuthenticated:true,bookIssuedQuotes:{FanDuel:{Medium:quote({americanOdds:975})}},now:at});
 assert.equal(a.tiers[1].books.FanDuel.status,'BOOK_COMBINED_PRICE_OUTSIDE_TIER');
 assert.equal(a.tiers[1].books.FanDuel.actualCombinedOdds,975);
 assert.equal(a.tiers[1].books.FanDuel.tierVerified,false);
 assert.equal(a.sportsbookVerifiedCount,0);
});
test('NBA uses exactly the same authenticated quote rule and never trusts a hypothetical feed by default',()=>{
 const nbaGame='401917234';
 const nbaLegs=['points','rebounds','assists'].map((cat,i)=>({
  gameId:nbaGame,playerId:String(i+101),name:'NBA Athlete '+i,
  team:i===0?'LAL':'DEN',category:cat,threshold:i===0?20:i===1?8:6
 }));
 const s={risk:'Small',status:'MODEL_CANDIDATE',legs:nbaLegs,requiredLegs:3,
  bookMarketAudits:{FanDuel:{gameId:nbaGame,book:'FanDuel',
   requestedTier:'Small',totalLegs:3,matchedLegs:3,allLegsMatched:true,missingLegs:[]}}};
 const q={...quote(),league:'nba',gameId:nbaGame,legs:nbaLegs,americanOdds:2600};
 const data={league:'nba',gameId:nbaGame,sgps:[s],bookIssuedQuotes:{FanDuel:{Small:q}},now:at};
 assert.equal(auditLeagueSgpEvent(data).sportsbookVerifiedCount,0);
 const result=auditLeagueSgpEvent({...data,quoteAdapterAuthenticated:true});
 assert.equal(result.sportsbookVerifiedCount,1);
 assert.equal(result.tiers[0].books.FanDuel.actualNetProfit,260);
});
