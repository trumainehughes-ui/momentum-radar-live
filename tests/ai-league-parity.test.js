import test from "node:test";
import assert from "node:assert/strict";
import { AI_MECHANICS } from "../lib/ai-mechanics/guardrails.js";
import { LEAGUE_PARITY, leaguePolicy, sharedLeagueControlsIdentical,
  supportedLeagueMarket } from "../lib/ai-mechanics/league-parity.js";

test("all eight NFL AI mechanics are automatically registered for NBA",()=>{
  assert.deepEqual(LEAGUE_PARITY.NBA.aiMechanics,AI_MECHANICS);
  assert.deepEqual(LEAGUE_PARITY.NFL.aiMechanics,LEAGUE_PARITY.NBA.aiMechanics);
});
test("NFL and NBA release gates, quote safeguards and cadence must not drift",()=>{
  assert.equal(sharedLeagueControlsIdentical(),true);
  for(const sport of ["NFL","NBA"]){
    const policy=leaguePolicy(sport);
    assert.equal(policy.publishAutomatically,false);
    assert.equal(policy.liveCombinedQuoteRequired,true);
    assert.deepEqual(policy.books,["DraftKings","FanDuel"]);
    assert.equal(policy.tiers.Nuke.minAmericanOdds,10000);
    assert.equal(policy.finalPregameCheckMinutes,30);
    assert.ok(policy.requiredControls.includes("game_analyzer"));
    assert.ok(policy.requiredControls.includes("postgame_learning"));
  }
});
test("NBA stat categories include points, rebounds, assists, threes and PRA",()=>{
  for(const market of ["points","rebounds","assists","three_pointers","pra",
    "points_rebounds","points_assists","rebounds_assists","steals","blocks"])
    assert.equal(supportedLeagueMarket("NBA",market),true,market);
  assert.equal(supportedLeagueMarket("NBA","rushing_yards"),false);
});
test("sport-specific market rules retain NFL five-yard alt target policy",()=>{
  assert.equal(leaguePolicy("NFL").yardageModelTargetStep,5);
  assert.equal(leaguePolicy("NBA").yardageModelTargetStep,null);
  assert.equal(supportedLeagueMarket("NFL","passing_yards"),true);
  assert.equal(supportedLeagueMarket("NFL","points"),false);
});
test("unknown leagues fail closed",()=>{
  assert.equal(leaguePolicy("MLB"),null);
  assert.equal(supportedLeagueMarket("MLB","points"),false);
});
