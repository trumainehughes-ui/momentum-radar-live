import test from "node:test";
import assert from "node:assert/strict";
import { filterCurrentRoleEvidence, isVerifiedNflStarterRole } from "../lib/ai-mechanics/role-evidence.js";
const record={name:"Sample Player",team:"PHI",authority:"NFL_OFFICIAL",status:"CONFIRMED_STARTER",source:"Official report",checkedAt:"2026-10-09T12:00:00Z"};
const now=Date.parse("2026-10-09T14:00:00Z"),kickoff=Date.parse("2026-10-10T00:00:00Z");
test("fresh official starter evidence passes",()=>assert.equal(filterCurrentRoleEvidence([record],{now,kickoff}).length,1));
test("old starter report is excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,checkedAt:"2026-09-28T12:00:00Z"}],{now,kickoff}).length,0));
test("future-dated reports are excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,checkedAt:"2026-10-10T12:00:00Z"}],{now,kickoff}).length,0));
test("untrusted report authority excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,authority:"UNKNOWN"}],{now,kickoff}).length,0));
test("missing kickoff fails closed",()=>assert.deepEqual(filterCurrentRoleEvidence([record],{now,kickoff:NaN}),[]));
test("post-kickoff role evidence excluded",()=>assert.equal(filterCurrentRoleEvidence([{...record,checkedAt:"2026-10-09T12:00:00Z"}],{now:Date.parse("2026-10-11T00:00:00Z"),kickoff}).length,1));


test("NFL endpoint ignores caller-supplied starter authority claims", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../api/nfl-game.js", import.meta.url), "utf8");
  assert.ok(!source.includes("req.body?.roleEvidence"), "client-provided roleEvidence must never become trusted");
  assert.ok(source.includes("filterCurrentRoleEvidence(verifiedGameEvidence(gameId)"), "only server-controlled game evidence can enter official role filter");
});

const confirmed = {name:"Example QB",team:"PHI",status:"CONFIRMED_STARTER",
  source:"ESPN current game starter roster",kind:"STRUCTURED",checkedAt:"2026-10-10T17:00:00Z"};
const signalNow=Date.parse("2026-10-10T17:05:00Z");
const signalKickoff=Date.parse("2026-10-10T17:35:00Z");

test("structured game-specific starter is verified with its original timestamp",()=>{
 assert.equal(isVerifiedNflStarterRole(confirmed,{now:signalNow,kickoff:signalKickoff}),true);
});
test("expected starter, usage-only role and unknown source never verify a confirmed starter",()=>{
 for(const override of [
  {status:"EXPECTED_STARTER"}, {status:"HIGH_USAGE_ROLE"},
  {kind:"DATA_VERIFIED_ROLE"},{kind:"UNKNOWN"},{source:""},
  {checkedAt:null},{checkedAt:"2026-10-01T17:00:00Z"}
 ]){
  assert.equal(isVerifiedNflStarterRole({...confirmed,...override},
    {now:signalNow,kickoff:signalKickoff}),false,JSON.stringify(override));
 }
});
test("legacy official report keeps observed timestamp rather than refreshing it",()=>{
 const official={...confirmed,kind:"REPORTED_CURRENT_GAME",
   checkedAt:"2026-10-09T17:00:00Z"};
 assert.equal(isVerifiedNflStarterRole(official,{now:signalNow,kickoff:signalKickoff}),true);
 assert.equal(isVerifiedNflStarterRole(official,{now:signalNow,kickoff:signalKickoff,
   maxAgeMs:15*60*1000}),false);
 assert.equal(isVerifiedNflStarterRole({...official,checkedAt:"2026-10-11T17:00:00Z"},
   {now:signalNow,kickoff:signalKickoff}),false);
});
test("past kickoff cannot be re-certified as fresh pregame source",()=>{
 assert.equal(isVerifiedNflStarterRole(confirmed,{
   now:signalKickoff+1000,kickoff:signalKickoff}),false);
});
test("NFL game endpoint preserves official timestamps and fails closed for usage-only role",async()=>{
 const { readFileSync } = await import("node:fs");
 const source=readFileSync(new URL("../api/nfl-game.js",import.meta.url),"utf8");
 assert.ok(source.includes("officialStarter=isVerifiedNflStarterRole("));
 assert.ok(source.includes("starterVerified:starterEligible"));
 assert.ok(source.includes("recommendationEligible:starterEligible"));
 assert.ok(source.includes("role:{verified:officialStarter"));
 assert.ok(source.includes("checkedAt:x._roleSignal?.checkedAt||null"));
 assert.ok(!source.includes("role:{verified:!!x._roleSignal"));
});
