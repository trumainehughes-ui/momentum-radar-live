import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pruneNflSgpsForEligibility } from "../lib/ai-mechanics/nfl-sgp-eligibility.js";
import { markBookSgpEstimate } from "../lib/ai-mechanics/sgp-display-evidence.js";

const eligible={name:"Active Receiver",playerID:"player-A",team:"DEN",cat:"receiving"};
const inactive={name:"Inactive Runner",playerID:"player-B",team:"DEN",cat:"rushing"};
const model={risk:"Nuke",mode:"DATA_MODEL",requiredLegs:2,
  legs:[eligible,inactive],candidateComplete:true,estimatedOdds:10500,
  actualSgpOdds:12000,payoutBandVerified:true,nukePayoutVerified:true,
  combinedBookQuoteVerified:true,verifiedLegs:2,eligibleBookLegs:2,
  verifiedAt:"2026-10-10T18:00:00Z",momentumScore:87,sgpScore:81,
  correlation:{score:89},explanation:{summary:"outdated"},marketMix:["receiving","rushing"]};
const sgps={Analytics:[model],DraftKings:[{...model,book:"DraftKings"}],
  FanDuel:[{...model,book:"FanDuel"}],mode:"MODEL_FIRST_BOOK_UNQUOTED"};
const eligibility={checked:true,blockedIds:new Set(["player-B"]),
  blockedNames:new Set()};

test("injury blocks a player from Analytics, DraftKings and FanDuel model tiers",()=>{
  const out=pruneNflSgpsForEligibility(sgps,eligibility);
  for(const key of ["Analytics","DraftKings","FanDuel"]){
    const s=out[key][0];
    assert.equal(s.legs.length,1,key);
    assert.equal(s.legs[0].playerID,"player-A",key);
    assert.equal(s.eligibilityPruned,true);
    assert.equal(s.removedIneligibleLegs,1);
    assert.equal(s.candidateComplete,false);
    assert.equal(s.estimatedOdds,null);
    assert.equal(s.actualSgpOdds,null);
    assert.equal(s.combinedBookQuoteVerified,false);
    assert.equal(s.payoutBandVerified,false);
    assert.equal(s.nukePayoutVerified,false);
    assert.equal(s.verifiedLegs,0);
    assert.equal(s.eligibleBookLegs,0);
    assert.equal(s.publishable,false);
    assert.equal(s.verifiedAt,null);
    assert.equal(s.momentumScore,null);
    assert.equal(s.correlation,null);
    assert.equal(s.explanation,null);
    assert.deepEqual(s.marketMix,["receiving"]);
    assert.match(s.reason,/Lineup\/injury update removed 1 ineligible leg/);
  }
  assert.equal(out.mode,"MODEL_FIRST_BOOK_UNQUOTED");
  assert.equal(sgps.Analytics[0].legs.length,2,"source object remains unchanged");
});
test("book column estimate sanitizer preserves the injured player warning",()=>{
 const out=pruneNflSgpsForEligibility(sgps,eligibility);
 const displayed=markBookSgpEstimate(out.FanDuel[0]);
 assert.equal(displayed.estimatedOdds,null);
 assert.equal(displayed.verifiedLegs,0);
 assert.equal(displayed.bookVerificationPending,true);
 assert.equal(displayed.publishableAsBookSgp,false);
 assert.match(displayed.pricingNote,/Lineup\/injury update/);
});
test("all removed legs leave a visible rebuild-pending tier without stale payout",()=>{
 const out=pruneNflSgpsForEligibility(sgps,{
   checked:true,blockedIds:new Set(["player-A","player-B"]),blockedNames:new Set()
 });
 assert.equal(out.Analytics.length,1);
 assert.equal(out.Analytics[0].legs.length,0);
 assert.equal(out.Analytics[0].candidateComplete,false);
 assert.equal(out.Analytics[0].estimatedOdds,null);
 assert.equal(out.Analytics[0].removedIneligibleLegs,2);
});
test("normalized name-only injury signals still remove players",()=>{
 const out=pruneNflSgpsForEligibility(sgps,{
   checked:true,blockedIds:new Set(),blockedNames:new Set(["INACTIVERUNNER"])
 });
 assert.equal(out.Analytics[0].legs.length,1);
});
test("safe candidates remain complete; unchecked injury feeds cannot claim new verification",()=>{
 const out=pruneNflSgpsForEligibility(sgps,{
  checked:true,blockedIds:new Set(["someone-else"]),blockedNames:new Set()
 });
 assert.equal(out.Analytics[0],model);
 assert.equal(out.Analytics[0].candidateComplete,true);
 assert.equal(pruneNflSgpsForEligibility(sgps,{checked:false}),sgps);
});
test("malformed or incomplete inputs do not crash the final filter",()=>{
 assert.deepEqual(pruneNflSgpsForEligibility(null,{checked:true}),{});
 assert.deepEqual(pruneNflSgpsForEligibility({Analytics:[null]},eligibility).Analytics,[]);
});
test("NFL builder does not overwrite already-pruned analytics candidates",()=>{
 const source=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(source.includes("return pruneNflSgpsForEligibility(sgps,elig)"));
 assert.ok(source.includes("sgps=pruneSgpsForEligibility(sgps,eligibility)"));
 assert.ok(source.includes("sgps.Analytics=(sgps.Analytics||[]).map("));
 assert.ok(!source.includes("sgps.Analytics=analyticsSgps.map("));
 assert.ok(source.includes("v83-net-profit-yardage-first"));
});
test("NFL view renders corrected model-first mode and changed-lineup warnings",()=>{
 const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(source.includes("'MODEL_FIRST_BOOK_UNQUOTED'].includes(d.sgps?.mode)"));
 assert.ok(source.includes("s.eligibilityPruned?"));
 assert.ok(source.includes("nflEscape(s.reason||'Lineup changed; rebuild the entire parlay.')"));
 assert.ok(source.includes("T-minus-30: "));
 assert.ok(source.includes("Zero verified book offers does not block model-only analysis."));
 assert.ok(source.includes("d.bookMarketAudit?.confirmedStarterRows"));
 assert.ok(source.includes("s.eligibilityPruned?"));
});
