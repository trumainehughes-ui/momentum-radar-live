import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {guardFinalNflSgpCards} from "../lib/ai-mechanics/nfl-sgp-tiers.js";
const yards=[
 {playerID:"qb",name:"Verified QB",cat:"passing"},
 {playerID:"rb",name:"Verified RB",cat:"rushing"},
 {playerID:"wr",name:"Verified WR",cat:"receiving"},
 {playerID:"td",name:"Verified TD",cat:"td"}
];
const allTD=["Justin Jefferson","Chris Olave","Devaughn Vele","Noah Fant","Juwan Johnson"].map((name,i)=>({playerID:"td"+i,name,cat:"td"}));
const card=(risk,legs)=>({risk,requiredLegs:legs.length,legs,
 estimatedOdds:25362,publishable:true,candidateComplete:true,
 payoutBandVerified:true,combinedBookQuoteVerified:true,momentumScore:85});
test("legacy Small four-TD and Medium five-TD cards never survive the final display gate",()=>{
 const input={Analytics:[card("Small",allTD.slice(0,4)),card("Medium",allTD)]};
 const result=guardFinalNflSgpCards(input);
 for(const x of result.Analytics){
  assert.equal(x.tierAssessment.compositionOk,false);
  assert.deepEqual(x.legs,[]);
  assert.equal(x.publishable,false);
  assert.equal(x.candidateComplete,false);
  assert.equal(x.estimatedOdds,null);
  assert.equal(x.combinedBookQuoteVerified,false);
  assert.equal(x.momentumScore,null);
  assert.match(x.reason,/yardage/i);
 }
});
test("compliant yardage-first Small stays intact but never gains verified price claims",()=>{
 const entry={...card("Small",yards),publishable:false,
  combinedBookQuoteVerified:false,estimatedOdds:null};
 const out=guardFinalNflSgpCards({Analytics:[entry]});
 assert.equal(out.Analytics[0].legs.length,4);
 assert.equal(out.Analytics[0].tierAssessment.compositionOk,true);
 assert.equal(out.Analytics[0].combinedBookQuoteVerified,false);
 assert.equal(out.Analytics[0].publishable,false);
});
test("removing an out or questionable player invalidates the WHOLE parlay, not only one leg",()=>{
 const entry=card("Small",yards);
 const out=guardFinalNflSgpCards({Analytics:[entry],
  other:{checked:true}},{blockedIds:new Set(["rb"])});
 assert.equal(out.Analytics[0].eligibilityPruned,true);
 assert.equal(out.Analytics[0].legs.length,0);
 assert.equal(out.Analytics[0].publishable,false);
 assert.equal(out.Analytics[0].candidateComplete,false);
 assert.equal(out.Analytics[0].actualSgpOdds,null);
 assert.equal(out.Analytics[0].estimatedOdds,null);
 assert.equal(out.other.checked,true);
});
test("legacy sportsbook TD-only card also fails; valid market mix not deleted",()=>{
 const book={DraftKings:[card("Medium",allTD),card("Small",yards)]};
 const o=guardFinalNflSgpCards(book);
 assert.deepEqual(o.DraftKings[0].legs,[]);
 assert.equal(o.DraftKings[0].combinedBookQuoteVerified,false);
 assert.equal(o.DraftKings[1].legs.length,4);
});
test("all SGP categories are rechecked even when injury coverage is not complete",()=>{
 const api=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(api.includes("return guardFinalNflSgpCards(sgps,{"));
 assert.ok(!api.includes("if(!elig?.checked)return sgps"));
 assert.ok(api.includes("CACHE_SCHEMA='v80-game-no-stale-book-quotes'"));
});
