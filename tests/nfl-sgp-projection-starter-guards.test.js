import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 validNflDvpRank,capNflTierYardTarget,isNflConfirmedGameQb
} from "../lib/ai-mechanics/nfl-projection-safety.js";

test("missing DVP and bogus #0 cannot inflate opponent adjustments",()=>{
 for(const invalid of [undefined,null,"",0,"0",-1,33,"99","NaN",{}]){
  assert.equal(validNflDvpRank(invalid),null,String(invalid));
 }
 assert.equal(validNflDvpRank(1),1);
 assert.equal(validNflDvpRank("32"),32);
 assert.equal(validNflDvpRank("5"),5);
 assert.equal(validNflDvpRank("1.5"),null);
});
test("Medium cannot use targets above the central model projection",()=>{
 const cases=[
  ["receiving",165,135,135], // Chris Olave screenshot audit
  ["passing",400,325,325], // Tyler Shough
  ["rushing",85,80,80], // Aaron Jones
  ["passing",220,215,215],
  ["rushing",72,68,65]
 ];
 for(const [category,target,projection,want] of cases){
  assert.equal(capNflTierYardTarget({category,tier:"Medium",target,projection}),want);
 }
});
test("Small floors use same conservative five-yard cap; Nuke stays a ceiling",()=>{
 assert.equal(capNflTierYardTarget({category:"rushing",tier:"Small",target:75,projection:65}),65);
 assert.equal(capNflTierYardTarget({category:"receiving",tier:"Nuke",target:141,projection:135}),145);
 assert.equal(capNflTierYardTarget({category:"passing",tier:"Nuke",target:337,projection:325}),340);
 assert.equal(capNflTierYardTarget({category:"rushing",tier:"Medium",target:80,projection:null}),null);
 assert.equal(capNflTierYardTarget({category:"receiving",tier:"Medium",target:85,projection:undefined}),null);
});
test("QB cannot enter model SGP merely because ESPN roster lists him as active",()=>{
 const pos="QB";
 assert.equal(isNflConfirmedGameQb({position:pos,role:{starterVerified:false,recommendationEligible:true}}),false);
 assert.equal(isNflConfirmedGameQb({position:pos,role:{starterVerified:true,recommendationEligible:true}}),false);
 assert.equal(isNflConfirmedGameQb({position:pos,role:{starterVerified:true,recommendationEligible:false,verification:{role:{verified:true}}}}),false);
 assert.equal(isNflConfirmedGameQb({position:pos,role:{starterVerified:true,recommendationEligible:true,verification:{role:{verified:true}}}}),true);
 assert.equal(isNflConfirmedGameQb({position:"WR",role:null}),true);
 assert.equal(isNflConfirmedGameQb({position:"RB",role:null}),true);
});
test("NFL SGP runtime uses strict DVP ranks, model-aligned Medium and confirmed QB roles",()=>{
 const api=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(api.includes("validNflDvpRank(ctx?.dvp?.defenseRanks"));
 assert.ok(api.includes("validNflDvpRank(ctx?.dvp?.offenseRanks"));
 assert.ok(api.includes("return capNflTierYardTarget({category:cat,tier:risk"));
 assert.ok(api.includes("function buildAnalyticsSgp(categories,ctx,roles)"));
 assert.ok(api.includes("isNflConfirmedGameQb({position:pos,role})"));
 assert.ok(api.includes("buildAnalyticsSgp(categories,ctx,roles)"));
 assert.ok(api.includes("v85-injury-pick-reconcile"));
 assert.ok(!api.includes("defRank=Number(ctx?.dvp?.defenseRanks"));
});
