import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectConfirmedNflBookMarkets } from "../lib/ai-mechanics/nfl-confirmed-book-markets.js";
const now=Date.parse("2026-10-11T16:30:00Z");
const player={playerId:"espn-id-7",name:"Sample Receiver",team:"DEN",
  availability:"ACTIVE_ROTATION",starterVerified:true,
  recommendationEligible:true,starterStatus:"CONFIRMED_STARTER",
  verification:{role:{verified:true,kind:"STRUCTURED",
    checkedAt:new Date(now-60000).toISOString()}}};
const market={eventID:"espn-game",sourceEventID:"sgo-event",
  playerID:"espn-id-7",name:"Sample Receiver",team:"DEN",
  source:"SportsGameOdds",provenance:"verified_espn_sgo_crosswalk",
  books:[{book:"FanDuel",line:74.5,odds:-110,available:true,
    lastUpdatedAt:new Date(now-40000).toISOString()}]};
const review=(overrides={})=>selectConfirmedNflBookMarkets({
  marketRows:[market],rolePlayers:[player],now,...overrides
});
test("real crosswalk, verified active starter and current FanDuel offer pass",()=>{
 assert.equal(review().length,1);
});
test("expected starter and high-usage role never imply book pick eligibility",()=>{
 for(const starterStatus of ["EXPECTED_STARTER","HIGH_USAGE_ROLE","UNVERIFIED_ROLE"]){
  assert.equal(review({rolePlayers:[{...player,starterStatus}]}).length,0,starterStatus);
 }
});
test("book-backed recommendation cannot use injured, inactive or questionable players",()=>{
 for(const availability of ["QUESTIONABLE","OUT","INACTIVE","IR"]){
  assert.equal(review({rolePlayers:[{...player,availability}]}).length,0,availability);
 }
});
test("source role must be both confirmed and independently verified",()=>{
 for(const p of [
  {...player,starterVerified:false},
  {...player,recommendationEligible:false},
  {...player,verification:{role:{...player.verification.role,verified:false}}},
  {...player,verification:{role:{...player.verification.role,kind:"DATA_VERIFIED_ROLE"}}},
  {...player,verification:{role:{...player.verification.role,checkedAt:new Date(now-49*3600000).toISOString()}}}
 ]) assert.equal(review({rolePlayers:[p]}).length,0,JSON.stringify(p));
});
test("an unambiguous player ID, team and name are all mandatory",()=>{
 assert.equal(review({rolePlayers:[{...player,playerId:"other"}]}).length,0);
 assert.equal(review({rolePlayers:[{...player,team:"KC"}]}).length,0);
 assert.equal(review({marketRows:[{...market,name:"Different Person"}]}).length,0);
 assert.equal(review({rolePlayers:[player,{...player}]}).length,0);
});
test("uncrosswalked sportsbook and model-priced props never qualify",()=>{
 for(const m of [
  {...market,provenance:"client_supplied"},
  {...market,source:"The Odds API"},
  {...market,sourceEventID:null},
  {...market,books:[]},
  {...market,books:[{...market.books[0],lastUpdatedAt:new Date(now-20*60000).toISOString()}]},
  {...market,books:[{...market.books[0],book:"Other Sportsbook"}]},
  {...market,books:[{...market.books[0],odds:30}]}
 ]) assert.equal(review({marketRows:[m]}).length,0,JSON.stringify(m));
});
test("malformed inputs fail closed",()=>{
 assert.deepEqual(selectConfirmedNflBookMarkets({marketRows:null,rolePlayers:[player],now}),[]);
 assert.deepEqual(selectConfirmedNflBookMarkets({marketRows:[market],rolePlayers:null,now}),[]);
 assert.deepEqual(selectConfirmedNflBookMarkets({marketRows:[market],rolePlayers:[player],now:NaN}),[]);
});
test("NFL market builder requires both roster and verified starter checks",()=>{
 const code=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(code.includes("const rosterMatchedRows=eligibilityFilter(approvedMarketRows,eligibility)"));
 assert.ok(code.includes("const rows=selectConfirmedNflBookMarkets({marketRows:rosterMatchedRows,rolePlayers:roles.players||[],now:Date.now()})"));
 assert.ok(code.includes("buildBookSgp(sgpRows,'DraftKings'"));
});
