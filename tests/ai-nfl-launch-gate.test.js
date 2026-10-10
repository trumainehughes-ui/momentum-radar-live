import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessNflLaunchReadiness } from "../lib/ai-mechanics/nfl-launch-gate.js";

const now=10000000;
const kickoff=new Date(now+20*60*1000).toISOString();
const finalPregameVerifiedAt=new Date(now-5*60*1000).toISOString();
const rolePlayers=["PHI","DAL"].map(team=>({
 team,position:"QB",starterVerified:true,starterStatus:"CONFIRMED_STARTER",
 verification:{role:{verified:true}}
}));
const marketEvidence={state:"BOOK_LINES_OBSERVED_UNQUOTED",observedBookLines:3};
const complete={gameId:"g1",home:"PHI",away:"DAL",rolePlayers,rosterChecked:true,
 marketEvidence,crosswalkVerified:true,verifiedCombinedBookQuotes:1,
 finalPregameVerifiedAt,kickoff,now};

test("fresh server-side evidence can pass readiness without publishing anything",()=>{
 const r=assessNflLaunchReadiness(complete);
 assert.equal(r.readyForLiveBookSgps,true);
 assert.equal(r.advisoryOnly,true);
 assert.equal(r.modelProjectionsMayDisplay,true);
 assert.deepEqual(r.missingEvidence,[]);
});
test("provider-outage analytics cannot be called sportsbook-ready",()=>{
 const r=assessNflLaunchReadiness({...complete,marketEvidence:{
   state:"PROVIDER_RATE_LIMITED",observedBookLines:0
 }});
 assert.equal(r.readyForLiveBookSgps,false);
 assert.ok(r.missingEvidence.includes("fresh_draftkings_or_fanduel_player_lines_missing"));
});
test("independent-leg estimate is not a combined sportsbook quote",()=>{
 const r=assessNflLaunchReadiness({...complete,verifiedCombinedBookQuotes:0});
 assert.equal(r.readyForLiveBookSgps,false);
 assert.ok(r.missingEvidence.includes("actual_combined_sgp_book_quote_missing"));
});
test("two teams' official QBs are required, not stale roster claims",()=>{
 const r=assessNflLaunchReadiness({...complete,rolePlayers:[rolePlayers[0],
   {...rolePlayers[1],verification:{role:{verified:false}}}]});
 assert.ok(r.missingEvidence.includes("both_starting_quarterbacks_unconfirmed"));
});
test("T-30 query flag cannot impersonate an independently recorded final check",()=>{
 const r=assessNflLaunchReadiness({...complete,finalPregameVerifiedAt:null,finalCheck:true});
 assert.ok(r.missingEvidence.includes("verified_final_pregame_check_pending"));
});
test("outdated or post-kickoff check cannot pass the gate",()=>{
 for(const date of [new Date(now-35*60000).toISOString(),
   new Date(now+30*60000).toISOString()]){
   const r=assessNflLaunchReadiness({...complete,finalPregameVerifiedAt:date});
   assert.equal(r.readyForLiveBookSgps,false);
 }
});
test("missing event crosswalk always prevents published sportsbook status",()=>{
 const r=assessNflLaunchReadiness({...complete,crosswalkVerified:false});
 assert.ok(r.missingEvidence.includes("server_verified_player_event_crosswalk_pending"));
});
test("NFL route never assumes a fake bookmaker quote or identity proof",()=>{
 const s=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.match(s,/releaseReadiness=assessNflLaunchReadiness/);
 assert.match(s,/crosswalkVerified:false,verifiedCombinedBookQuotes:0/);
});
