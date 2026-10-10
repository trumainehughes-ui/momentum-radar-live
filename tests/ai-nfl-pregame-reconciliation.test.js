import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessNflPregameReconciliation } from "../lib/ai-mechanics/nfl-pregame-reconciliation.js";

const now=Date.parse("2026-10-11T17:40:00Z");
const kickoff=new Date(now+20*60*1000).toISOString();
const at=new Date(now-60*1000).toISOString();
const rolePlayers=["DEN","KC"].map(team=>({
  team,position:"QB",starterVerified:true,starterStatus:"CONFIRMED_STARTER",
  verification:{role:{verified:true,checkedAt:at}}
}));
const base={gameId:"401-test",home:"DEN",away:"KC",kickoff,now,
  requested:true,rosterChecked:true,injuryFeedChecked:true,
  injuryCheckedAt:at,rolePlayers,
  marketEvidence:{state:"BOOK_LINES_OBSERVED_UNQUOTED",observedBookLines:4},
  sgoShadow:{ready:true,crosswalkVerified:true,quoteRows:4}
};

test("confirmed current-source evidence is required to record T-minus-30 check",()=>{
 const result=assessNflPregameReconciliation(base);
 assert.equal(result.phase,"SOURCES_RECONCILED");
 assert.equal(result.finalPregameVerifiedAt,new Date(now).toISOString());
 assert.equal(result.sourceChecksPassed,true);
 assert.equal(result.combinedSgpQuoteVerified,false);
 assert.equal(result.advisoryOnly,true);
});
test("query flag alone never produces a completed pregame check",()=>{
 const result=assessNflPregameReconciliation({gameId:"g",requested:true,now});
 assert.equal(result.finalPregameVerifiedAt,null);
 assert.equal(result.phase,"NO_GAME");
 assert.ok(result.missingEvidence.length>0);
});
test("with only model projections the sportsbook evidence cannot be verified",()=>{
 const result=assessNflPregameReconciliation({...base,
   marketEvidence:{state:"ANALYTICS_ONLY",observedBookLines:0},
   sgoShadow:{ready:false,crosswalkVerified:false,quoteRows:0}});
 assert.equal(result.phase,"RECONCILIATION_BLOCKED");
 assert.equal(result.finalPregameVerifiedAt,null);
 assert.ok(result.missingEvidence.includes("fresh_game_scoped_book_lines_unverified"));
});
test("roster call failure cannot be mistaken for confirmed inactive list",()=>{
 const result=assessNflPregameReconciliation({...base,rosterChecked:false});
 assert.equal(result.finalPregameVerifiedAt,null);
 assert.ok(result.missingEvidence.includes("current_teams_rosters_incomplete"));
});
test("missing, untrusted, or stale injury evidence fails closed",()=>{
 for(const update of [
   {injuryFeedChecked:false},{injuryCheckedAt:null},
   {injuryCheckedAt:new Date(now-16*60*1000).toISOString()},
   {injuryCheckedAt:new Date(now+1000).toISOString()}
 ]){
   const r=assessNflPregameReconciliation({...base,...update});
   assert.equal(r.finalPregameVerifiedAt,null);
   assert.ok(r.missingEvidence.includes("current_injury_feed_unverified"));
 }
});
test("historical, expected, data-derived and unverified starter claims do not pass",()=>{
 const wrongs=[
   {...rolePlayers[1],starterStatus:"EXPECTED_STARTER"},
   {...rolePlayers[1],starterStatus:"HIGH_USAGE_ROLE"},
   {...rolePlayers[1],starterVerified:false},
   {...rolePlayers[1],verification:{role:{verified:false,checkedAt:at}}},
   {...rolePlayers[1],verification:{role:{verified:true,checkedAt:new Date(now-17*60*1000).toISOString()}}}
 ];
 for(const bad of wrongs){
   const r=assessNflPregameReconciliation({...base,rolePlayers:[rolePlayers[0],bad]});
   assert.equal(r.finalPregameVerifiedAt,null);
   assert.ok(r.missingEvidence.includes("both_current_starting_quarterbacks_unverified"));
 }
});
test("refresh before the final 30-minute window remains preliminary",()=>{
 const r=assessNflPregameReconciliation({...base,kickoff:new Date(now+31*60*1000).toISOString()});
 assert.equal(r.phase,"BEFORE_T_MINUS_30");
 assert.equal(r.finalPregameVerifiedAt,null);
});
test("a completed game cannot receive a fresh pregame verification",()=>{
 const r=assessNflPregameReconciliation({...base,kickoff:new Date(now-1000).toISOString()});
 assert.equal(r.phase,"KICKOFF_PASSED");
 assert.equal(r.finalPregameVerifiedAt,null);
});
test("nonrequested checks can be source-complete but cannot claim final verification",()=>{
 const r=assessNflPregameReconciliation({...base,requested:false});
 assert.equal(r.sourceChecksPassed,true);
 assert.equal(r.phase,"NOT_REQUESTED");
 assert.equal(r.finalPregameVerifiedAt,null);
});
test("NFL API uses source checks and separates refresh requested from verified",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(src.includes("pregameReconciliation=assessNflPregameReconciliation("));
 assert.ok(src.includes("injuryFeedChecked:eligibility.injuryFeedChecked"));
 assert.ok(src.includes("rosterChecked:eligibility.checked"));
 assert.ok(src.includes("finalPregameVerifiedAt:pregameReconciliation.finalPregameVerifiedAt"));
 assert.ok(src.includes("finalPregameRefreshRequested:finalCheckRequested"));
 assert.ok(src.includes("finalPregameReconcile:pregameReconciliation.finalPregameVerifiedAt!==null"));
 assert.ok(src.includes("rosterFetchedTeams.size===2"));
 assert.ok(src.includes("d?.eligibility?.ready!==true"));
});
