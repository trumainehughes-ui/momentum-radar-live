import test from "node:test";
import assert from "node:assert/strict";
import { markBookSgpEstimate } from "../lib/ai-mechanics/sgp-display-evidence.js";

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
