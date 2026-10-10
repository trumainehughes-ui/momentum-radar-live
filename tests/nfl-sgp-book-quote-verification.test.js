import test from "node:test";
import assert from "node:assert/strict";
import {verifyNflBookCombinedSgpQuote} from "../lib/ai-mechanics/nfl-book-issued-sgp.js";
const game="401872987";
const now=Date.parse("2026-10-10T17:50:00Z");
const legs=[
 {eventID:game,team:"MIN",playerID:"11",name:"Vikings QB",cat:"passing",analyticsThreshold:225},
 {eventID:game,team:"NO",playerID:"22",name:"Saints RB",cat:"rushing",analyticsThreshold:65},
 {eventID:game,team:"MIN",playerID:"33",name:"Vikings WR",cat:"receiving",analyticsThreshold:70},
 {eventID:game,team:"NO",playerID:"44",name:"Saints TD",cat:"td",analyticsThreshold:"Anytime TD"}
];
const quote=(overrides={})=>({
 sourceType:"BOOK_ISSUED_COMBINED_SGP",book:"FanDuel",gameId:game,
 sourceQuoteAt:new Date(now-30000).toISOString(),americanOdds:2500,
 legs:[...legs].reverse(),...overrides
});
const check=(q=quote(),params={})=>verifyNflBookCombinedSgpQuote({
 quote:q,book:"FanDuel",gameId:game,legs,risk:"Small",
 now,providerAuthenticated:true,...params
});
test("genuine book-issued combined +2500 yields $250 NET profit on $10 stake",()=>{
 const r=check();
 assert.equal(r.verified,true);
 assert.equal(r.tierVerified,true);
 assert.equal(r.book,"FanDuel");
 assert.equal(r.actualCombinedOdds,2500);
 assert.equal(r.actualNetProfit,250);
 assert.equal(r.actualTotalReturn,260);
 assert.equal(r.notGuaranteedAtPlacement,true);
});
test("cross-tier real bookmaker combined price blocks falsely small classification",()=>{
 const r=check(quote({americanOdds:25362}));
 assert.equal(r.verified,true);
 assert.equal(r.tierVerified,false);
 assert.equal(r.observedBand,"Nuke");
 assert.equal(r.actualNetProfit,2536.2);
 assert.equal(r.actualTotalReturn,2546.2);
 assert.equal(r.reason,"BOOK_QUOTE_OUTSIDE_REQUESTED_TIER");
});
test("even a perfectly matched quote requires authenticated server provider adapter",()=>{
 const r=check(quote(),{providerAuthenticated:false});
 assert.equal(r.verified,false);
 assert.equal(r.reason,"BOOK_SOURCE_NOT_AUTHENTICATED");
 assert.equal(r.actualCombinedOdds,null);
});
test("individual odds multiplication, web snippets and AI do not count as a combined quote",()=>{
 for(const sourceType of ["PROBABILITY_ESTIMATE","BRAVE_SEARCH_SNIPPET","MODEL_INDEPENDENT_MULTIPLICATION","PLAYER_PROP_PRICE"]){
  const r=check(quote({sourceType}));
  assert.equal(r.verified,false,sourceType);
 }
});
test("a stale, future or missing original book quote timestamp always fails",()=>{
 for(const at of [null,"2026-10-10T17:30:00Z",
  "2026-10-10T18:00:00Z","not-a-date"]){
  const r=check(quote({sourceQuoteAt:at}));
  assert.equal(r.verified,false,JSON.stringify(at));
  assert.equal(r.reason,"BOOK_COMBINED_PRICE_STALE");
 }
});
test("a missing, extra, changed or duplicated player market disqualifies a quote",()=>{
 for(const alt of [
  quote({legs:legs.slice(0,3)}),
  quote({legs:[...legs,legs[0]]}),
  quote({legs:legs.map((x,i)=>i===0?{...x,analyticsThreshold:250}:x)}),
  quote({legs:legs.map((x,i)=>i===0?{...x,playerID:"wrong-player"}:x)}),
  quote({legs:legs.map((x,i)=>i===0?{...x,team:"JAX"}:x)}),
  quote({legs:[legs[0],legs[0],legs[2],legs[3]]})
 ]){
  const r=check(alt);
  assert.equal(r.verified,false);
  assert.equal(r.tierVerified,false);
  assert.equal(r.actualCombinedOdds,null);
 }
});
test("book, ESPN event and actual quote odds must all match trusted source",()=>{
 for(const alt of [
  quote({book:"DraftKings"}),
  quote({gameId:"401872981"}),
  quote({americanOdds:NaN}),
  quote({americanOdds:-110}),
  quote({americanOdds:0})
 ]){
  assert.equal(check(alt).verified,false);
 }
});
test("net tier boundaries are consistent for all games",()=>{
 for(const [odds,risk,expectedProfit] of [
  [2000,"Small",200],[3000,"Small",300],
  [3001,"Medium",300.1],[8000,"Medium",800],
  [10000,"Nuke",1000],[25362,"Nuke",2536.2]
 ]){
  const checked=check(quote({americanOdds:odds}),{risk});
  assert.equal(checked.tierVerified,true,String(odds));
  assert.equal(checked.actualNetProfit,expectedProfit);
 }
});
