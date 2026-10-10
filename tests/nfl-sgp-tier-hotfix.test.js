import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessNflSgpTier,classifyNflSgpOdds} from "../lib/ai-mechanics/nfl-sgp-tiers.js";

const screenshot=[
 {name:"Josh Cameron",playerID:"josh",cat:"td"},
 {name:"Dallas Goedert",playerID:"dallas",cat:"td"},
 {name:"Chris Rodriguez Jr.",playerID:"chris",cat:"td"},
 {name:"Bhayshul Tuten",playerID:"tuten",cat:"td"}
];
test("user screenshot's +25362 four-touchdown SGP is never a Small",()=>{
 assert.equal(classifyNflSgpOdds(25362),"Nuke");
 const r=assessNflSgpTier({risk:"Small",legs:screenshot,requiredLegs:4,combinedBookOdds:25362});
 assert.equal(r.compositionOk,false);
 assert.equal(r.tierVerified,false);
 assert.equal(r.observedOddsCategory,"Nuke");
});
test("only a market-diverse Small is a model candidate, never a verified price",()=>{
 const mixed=[
  {name:"QB",playerID:"qb",cat:"passing"},
  {name:"RB",playerID:"rb",cat:"rushing"},
  {name:"WR",playerID:"wr",cat:"receiving"},
  screenshot[0]
 ];
 const m=assessNflSgpTier({risk:"Small",legs:mixed,requiredLegs:4});
 assert.equal(m.compositionOk,true);
 assert.equal(m.status,"COMBINED_PRICE_UNVERIFIED");
 assert.equal(m.tierVerified,false);
 assert.equal(assessNflSgpTier({risk:"Small",legs:[...screenshot],requiredLegs:4}).compositionOk,false);
});
test("observed combined quote trumps a different independent-leg estimate",()=>{
 const mixed=[
  {name:"QB",playerID:"qb",cat:"passing"},
  {name:"RB",playerID:"rb",cat:"rushing"},
  {name:"WR",playerID:"wr",cat:"receiving"},
  screenshot[0]
 ];
 const m=assessNflSgpTier({risk:"Small",legs:mixed,requiredLegs:4,
  estimatedOdds:2100,combinedBookOdds:25362});
 assert.equal(m.status,"ACTUAL_BOOK_PRICE_OUTSIDE_TIER");
 assert.equal(m.observedOddsCategory,"Nuke");
});
test("Small $300 total boundary is +2900; Nuke minimum is +10000",()=>{
 assert.equal(classifyNflSgpOdds(1900),"Small");
 assert.equal(classifyNflSgpOdds(2900),"Small");
 assert.equal(classifyNflSgpOdds(2901),"Medium");
 assert.equal(classifyNflSgpOdds(10000),"Nuke");
});
test("production hotfix rejects all-TD Small model and marks it unpublishable",()=>{
 const api=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(api.includes("if(x.cat==='td'&&legs.filter(v=>v.cat==='td').length>=(risk==='Small'?1:2))return false"));
 assert.ok(api.includes("const mix=fillNflSgpMarketMix({risk,count,pool:riskPool,legs,add})"));
 assert.ok(api.includes("const mix=fillNflSgpMarketMix({risk,count,pool:rotated,legs,add})"));
 assert.ok(api.includes("modelOnly:true,candidateComplete:tierAssessment.compositionOk,publishable:false"));
 assert.ok(api.includes("sgps.Analytics=(sgps.Analytics||[]).map(s=>({...s,publishable:false"));
 assert.ok(!api.includes("sgps.Analytics=buildAnalyticsSgp(categories,ctx).map(s=>({...s,publishable:true"));
 assert.ok(api.includes("CACHE_SCHEMA='v74-sgp-tier-quote-guard'"));
});
test("production view clearly disclaims unverified $10 payouts",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(html.includes("MODEL CANDIDATE • Combined sportsbook odds not verified"));
 assert.ok(html.includes("Illustrative $10 target (not verified): "));
 assert.ok(html.includes("NOT READY • "));
 assert.ok(html.includes("'MODEL_FIRST_BOOK_UNQUOTED'"));
});
