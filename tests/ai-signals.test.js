import test from "node:test";
import assert from "node:assert/strict";
import { evaluateInjuryImpact, evaluatePropValue, summarizeBacktest, validateEvidence } from "../lib/ai-mechanics/signals.js";
test("injury transition triggers review but never auto-replaces", () => {
  const result = evaluateInjuryImpact({playerId:"a",team:"X",status:"active"},{playerId:"a",team:"X",status:"out"});
  assert.equal(result.changed,true); assert.equal(result.autoReplace,false); assert.ok(result.review.includes("best_of_slate"));
});
test("identity mismatch cannot trigger injury update",()=>assert.equal(evaluateInjuryImpact({playerId:"a",team:"X",status:"active"},{playerId:"b",team:"X",status:"out"}).changed,false));
test("no-vig prop value does not claim calibrated accuracy",()=>{const r=evaluatePropValue(0.6,-110,-110);assert.ok(Math.abs(r.edge-0.1)<1e-10);assert.equal(r.requiresCalibration,true)});
test("backtest Brier score uses only graded valid observations",()=>{const r=summarizeBacktest([{predicted:0.8,hit:true},{predicted:0.2,hit:false},{predicted:3,hit:true}]);assert.equal(r.samples,2);assert.ok(Math.abs(r.brier-0.04)<1e-10)});
test("freshness rejects future and stale evidence",()=>{assert.equal(validateEvidence({source:"ESPN",timestamp:1000},100,1050),true);assert.equal(validateEvidence({source:"ESPN",timestamp:1000},100,1200),false);assert.equal(validateEvidence({source:"ESPN",timestamp:2000},100,1050),false)});
