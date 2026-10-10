import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessNflSgpTier,classifyNflSgpOdds,NFL_SGP_TIERS} from "../lib/ai-mechanics/nfl-sgp-tiers.js";
import {markAnalyticsSgpCandidate} from "../lib/ai-mechanics/sgp-display-evidence.js";
const picks=[
 {playerID:"qb",name:"Starting Quarterback",cat:"passing"},
 {playerID:"wr",name:"Featured Receiver",cat:"receiving"},
 {playerID:"rb",name:"Running Back",cat:"rushing"},
 {playerID:"td",name:"Touchdown Scorer",cat:"td"}
];
const fourTd=[
 {playerID:"josh",name:"Josh Cameron",cat:"td"},
 {playerID:"dallas",name:"Dallas Goedert",cat:"td"},
 {playerID:"chris",name:"Chris Rodriguez Jr.",cat:"td"},
 {playerID:"tuten",name:"Bhayshul Tuten",cat:"td"}
];
test("real four-anytime-TD bet slip at +25362 is Nuke-level, never Small",()=>{
 assert.equal(classifyNflSgpOdds(25362),"Nuke");
 const check=assessNflSgpTier({risk:"Small",legs:fourTd,requiredLegs:4,combinedBookOdds:25362});
 assert.equal(check.compositionOk,false);
 assert.equal(check.tierVerified,false);
 assert.equal(check.observedOddsCategory,"Nuke");
 assert.equal(check.tdLegs,4);
 assert.match(check.reason,/at most 1 anytime-TD/);
});
test("Small requires diverse model props with at most one TD and no duplicate players",()=>{
 const good=assessNflSgpTier({risk:"Small",legs:picks,requiredLegs:4});
 assert.equal(good.compositionOk,true);
 assert.equal(good.tierVerified,false);
 assert.equal(good.status,"COMBINED_PRICE_UNVERIFIED");
 const tooMany=assessNflSgpTier({risk:"Small",
  legs:[picks[0],picks[1],fourTd[0],fourTd[1]],requiredLegs:4});
 assert.equal(tooMany.compositionOk,false);
 const dup=assessNflSgpTier({risk:"Small",
  legs:[picks[0],{...picks[0],cat:"receiving"},picks[2],picks[3]],requiredLegs:4});
 assert.equal(dup.compositionOk,false);
});
test("Medium is stricter than Nuke about TD concentration and requires 3 distinct markets",()=>{
 const medium=assessNflSgpTier({risk:"Medium",requiredLegs:5,
  legs:[...picks,fourTd[0]]});
 assert.equal(medium.compositionOk,true);
 const allTd=assessNflSgpTier({risk:"Medium",requiredLegs:4,legs:fourTd});
 assert.equal(allTd.compositionOk,false);
 assert.equal(NFL_SGP_TIERS.Medium.maxTdLegs,2);
});
test("bookmaker combined odds take precedence over independent multiplied leg estimates",()=>{
 const observed=assessNflSgpTier({risk:"Small",requiredLegs:4,
  legs:picks,estimatedOdds:2400,combinedBookOdds:25362});
 assert.equal(observed.status,"ACTUAL_BOOK_PRICE_OUTSIDE_TIER");
 assert.equal(observed.observedOddsCategory,"Nuke");
 assert.equal(observed.estimatedOddsCategory,"Small");
 assert.equal(observed.tierVerified,false); // screenshot number is not a live quote feed
});
test("American odds tier targets preserve $10 gross return bands",()=>{
 assert.equal(classifyNflSgpOdds(1900),"Small");
 assert.equal(classifyNflSgpOdds(2899),"Small");
 assert.equal(classifyNflSgpOdds(2900),"Small");
 assert.equal(classifyNflSgpOdds(2901),"Medium");
 assert.equal(classifyNflSgpOdds(3000),"Medium");
 assert.equal(classifyNflSgpOdds(6000),"Medium");
 assert.equal(classifyNflSgpOdds(10000),"Nuke");
 assert.equal(classifyNflSgpOdds(null),"UNKNOWN");
});
test("an incomplete model build is not a completed Small SGP candidate",()=>{
 const invalid=markAnalyticsSgpCandidate({risk:"Small",requiredLegs:4,
   tierAssessment:assessNflSgpTier({risk:"Small",requiredLegs:4,legs:fourTd}),
   legs:fourTd,estimatedOdds:25362,publishable:true});
 assert.equal(invalid.candidateComplete,false);
 assert.equal(invalid.publishable,false);
 assert.equal(invalid.actualSgpOdds,null);
 assert.match(invalid.pricingNote,/at most 1 anytime-TD/);
});
test("NFL builder enforces tier diversity even in its fallback pass",()=>{
 const api=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.match(api,/if\(x\.cat==='td'&&legs\.filter\(v=>v\.cat==='td'\)\.length>=\(risk==='Small'\?1:2\)\)return false/);
 assert.ok(api.includes("const tierAssessment=assessNflSgpTier({risk,legs,requiredLegs:count})"));
 assert.ok(api.includes("if(!tierAssessment.compositionOk)return{book,risk,legs:[]"));
 assert.ok(api.includes("v82-sgp-tier-composition"));
 assert.ok(api.includes("Number.isInteger(or)&&or>=1&&or<=32"));
 assert.ok(api.includes("Number.isInteger(dr)&&dr>=1&&dr<=32"));
});
test("NFL UI labels payout targets as illustrative and does not imply combined odds",()=>{
 const ui=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(ui.includes("Illustrative target (not verified): "));
 assert.ok(ui.includes("MODEL COMPOSITION ONLY • Combined sportsbook odds unverified"));
 assert.ok(ui.includes("Needs rebuild: "));
});
