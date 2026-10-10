import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markBookSgpEstimate, markAnalyticsSgpCandidate } from "../lib/ai-mechanics/sgp-display-evidence.js";

test("passing estimated payout threshold never claims a combined book quote", () => {
  const original={book:"FanDuel",risk:"Nuke",estimatedOdds:13400,
    payoutBandVerified:true,requiredLegs:3,verifiedLegs:3,
    legs:[{name:"Sample Player",line:100}]};
  const reviewed=markBookSgpEstimate(original);
  assert.equal(reviewed.estimatedOdds,13400);
  assert.equal(reviewed.estimatedTargetBandMet,true);
  assert.equal(reviewed.payoutBandVerified,false);
  assert.equal(reviewed.combinedBookQuoteVerified,false);
  assert.equal(reviewed.actualSgpOdds,null);
  assert.equal(reviewed.combinedPriceType,"independent_leg_estimate");
  assert.equal(reviewed.bookVerificationPending,true);
  assert.equal(reviewed.verifiedLegs,0);
  assert.equal(reviewed.eligibleBookLegs,3);
  assert.equal(reviewed.publishableAsBookSgp,false);
  assert.equal(reviewed.nukePayoutVerified,false);
  assert.equal(reviewed.verifiedAt,null);
  assert.equal(original.payoutBandVerified,true,"pure labeler never mutates upstream build");
});
test("missing independent-leg quote leaves book price unavailable",()=>{
  const reviewed=markBookSgpEstimate({book:"DraftKings",risk:"Small",estimatedOdds:null});
  assert.equal(reviewed.estimatedOdds,null);
  assert.equal(reviewed.combinedPriceType,"not_available");
  assert.equal(reviewed.payoutBandVerified,false);
  assert.equal(reviewed.bookVerificationPending,true);
  assert.equal(reviewed.modelDriven,true);
});
test("spoofed payout fields never validate an SGP",()=>{
  const reviewed=markBookSgpEstimate({book:"FanDuel",risk:"Medium",
    estimatedOdds:5000,actualSgpOdds:5000,combinedBookQuoteVerified:true,
    bookVerificationPending:false,payoutBandVerified:true});
  assert.equal(reviewed.actualSgpOdds,null);
  assert.equal(reviewed.combinedBookQuoteVerified,false);
  assert.equal(reviewed.bookVerificationPending,true);
  assert.equal(reviewed.payoutBandVerified,false);
});
test("preexisting below-target book candidate stays unverified",()=>{
  const reviewed=markBookSgpEstimate({risk:"Nuke",estimatedOdds:8600,payoutBandVerified:false});
  assert.equal(reviewed.estimatedTargetBandMet,false);
  assert.equal(reviewed.payoutBandVerified,false);
});
test("null passthrough is safe",()=>assert.equal(markBookSgpEstimate(null),null));

test("bookmaker quote timestamps cannot be spoofed by model candidate metadata",()=>{
  const candidate=markBookSgpEstimate({
    book:"DraftKings",risk:"Nuke",estimatedOdds:12500,
    payoutBandVerified:true,nukePayoutVerified:true,verifiedLegs:6,
    verifiedAt:"2026-10-10T18:00:00.000Z",
    modelDriven:false,actualSgpOdds:16000,publishableAsBookSgp:true
  });
  assert.equal(candidate.nukePayoutVerified,false);
  assert.equal(candidate.verifiedLegs,0);
  assert.equal(candidate.eligibleBookLegs,6);
  assert.equal(candidate.actualSgpOdds,null);
  assert.equal(candidate.verifiedAt,null);
  assert.equal(candidate.modelGeneratedAt,"2026-10-10T18:00:00.000Z");
  assert.equal(candidate.publishableAsBookSgp,false);
});
test("NFL AI payload disambiguates independently priced model legs and combined quotes",()=>{
 const src=readFileSync(new URL("../public-ai.js",import.meta.url),"utf8");
 assert.ok(src.includes("combinedBookQuoteVerified:s.combinedBookQuoteVerified===true"));
 assert.ok(src.includes("eligibleBookLegs:Number(s.eligibleBookLegs||0)"));
 assert.ok(src.includes("combinedPriceType:s.combinedPriceType||'not_available'"));
 assert.ok(!src.includes("s.payoutBandVerified?' • book payout verified'"));
});
test("NFL UI uses actual model generation time, not falsely verified timestamp",()=>{
 const src=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(src.includes("Model generated "));
 assert.ok(src.includes("s.modelGeneratedAt"));
 assert.ok(!src.includes("new Date(s.verifiedAt).toLocaleTimeString()"));
});
test("NFL model builds are never labeled combined-book SGP verified",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(src.includes("mode:'MODEL_FIRST_BOOK_UNQUOTED'"));
 assert.ok(!src.includes("const hasVerifiedSgp="));
 assert.ok(src.includes("Individual DraftKings/FanDuel player-market offers are not bookmaker-issued combined SGP quotes."));
});

test("model-only SGP legs cannot retain inferred book eligibility or quote timestamps",()=>{
 const s=markAnalyticsSgpCandidate({
   risk:"Small",book:"Combined",mode:"DATA_MODEL",requiredLegs:2,
   estimatedOdds:2500,actualSgpOdds:2700,verifiedAt:"2026-10-10T18:00:00Z",
   payoutBandVerified:true,nukePayoutVerified:true,publishable:true,
   combinedBookQuoteVerified:true,verifiedLegs:2,
   legs:[
    {name:"Player A",analyticsThreshold:85,sportsbookVerified:true,
     availableAt:["DraftKings"],bookThresholdCaps:{DraftKings:100},
     bookOffer:{book:"DraftKings",line:85,odds:-110},verifiedAt:"2026-10-10T18:00:00Z"},
    {name:"Player B",analyticsThreshold:65,sportsbookVerified:true}
   ]
 });
 assert.equal(s.displayable,true);
 assert.equal(s.publishable,false);
 assert.equal(s.candidateComplete,true);
 assert.equal(s.combinedBookQuoteVerified,false);
 assert.equal(s.verifiedLegs,0);
 assert.equal(s.eligibleBookLegs,0);
 assert.equal(s.actualSgpOdds,null);
 assert.equal(s.estimatedOdds,null);
 assert.equal(s.verifiedAt,null);
 assert.equal(s.modelGeneratedAt,"2026-10-10T18:00:00Z");
 assert.equal(s.combinedPriceType,"model_projection_no_book_quote");
 assert.equal(s.nukePayoutVerified,false);
 for(const leg of s.legs){
   assert.equal(leg.sportsbookVerified,false);
   assert.equal(leg.marketVerificationPending,true);
   assert.deepEqual(leg.availableAt,[]);
   assert.deepEqual(leg.bookThresholdCaps,{});
   assert.equal(leg.bookOffer,null);
   assert.equal(leg.verifiedAt,null);
 }
});
test("partial small/medium/nuke model candidates are visible, not published",()=>{
 const result=markAnalyticsSgpCandidate({risk:"Nuke",requiredLegs:6,
   legs:[{name:"Sample QB",analyticsThreshold:310}],publishable:true});
 assert.equal(result.candidateComplete,false);
 assert.equal(result.displayable,true);
 assert.equal(result.publishable,false);
 assert.equal(result.legs.length,1);
});
test("NFL analytics tiers no longer rely on assumed sportsbook line ladders",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(src.includes("const threshold=x.cat==='td'?'Anytime TD':Number(rawThreshold)"));
 assert.ok(!src.includes("if(!playable&&risk!=='Nuke')return false"));
 assert.ok(src.includes("sportsbookVerified:false,availableAt:[],bookThresholdCaps:{}"));
 assert.ok(src.includes("const analyticsSgps=gameId?buildAnalyticsSgp(categories,ctx).map(markAnalyticsSgpCandidate):[]"));
 assert.ok(src.includes("sgps.Analytics=analyticsSgps.map("));
 assert.ok(!src.includes("publishable:true"));
});
