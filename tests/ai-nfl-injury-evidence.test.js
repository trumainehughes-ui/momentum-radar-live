import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {assessNflTeamInjuryEvidence} from "../lib/ai-mechanics/nfl-injury-evidence.js";
const teams=[{id:"4",abbr:"DEN"},{id:"12",abbr:"KC"}];
const player={athlete:{id:"123",displayName:"Example Runner"},status:"Out"};
const den={team:{id:"4",abbreviation:"DEN"},injuries:[player]};
const kc={team:{id:"12",abbreviation:"KC"},injuries:[]};

test("NFL injury gate requires structured coverage for both teams",()=>{
 const one=assessNflTeamInjuryEvidence({teams,groups:[den]});
 assert.equal(one.checked,false);
 assert.equal(one.reason,"incomplete_injury_team_coverage");
 assert.equal(one.blockedIds.has("123"),true);
 const both=assessNflTeamInjuryEvidence({teams,groups:[den,kc]});
 assert.equal(both.checked,true);
 assert.deepEqual(both.coveredTeams,["DEN","KC"]);
 assert.equal(both.blockedIds.has("123"),true);
 assert.equal(both.blockedNames.has("EXAMPLERUNNER"),true);
});
test("NFL selected-game summary and league fallback can together cover the matchup",()=>{
 const league={team:{id:"12",abbreviation:"KC"},items:[
  {athlete:{id:"999",displayName:"Example Receiver"},details:{status:"Doubtful"}}
 ]};
 const a=assessNflTeamInjuryEvidence({teams,groups:[den,league]});
 assert.equal(a.checked,true);
 assert.equal(a.blockedIds.has("123"),true);
 assert.equal(a.blockedIds.has("999"),true);
});
test("success-shaped but empty or unrelated injury responses never count as complete",()=>{
 for(const groups of [[],[{}],[{team:{id:"88",abbreviation:"LAR"},injuries:[]}],
   [den,{team:{id:"12",abbreviation:"KC"}}],
   [den,{team:{id:"12",abbreviation:"KC"},injuries:null}]]){
   assert.equal(assessNflTeamInjuryEvidence({teams,groups}).checked,false,JSON.stringify(groups));
 }
});
test("real but empty team injury lists are counted only when both are explicitly represented",()=>{
 const r=assessNflTeamInjuryEvidence({teams,groups:[
  {...den,injuries:[]},kc
 ]});
 assert.equal(r.checked,true);
 assert.equal(r.blockedIds.size,0);
});
test("injury status is normalized and excludes only unavailable or doubtful players",()=>{
 const statusPairs=[["Out",true],["Doubtful",true],["Inactive",true],
  ["IR",true],["Injured Reserve",true],["Suspended",true],
  ["Questionable",false],["Probable",false],["Healthy",false]];
 for(const [status,excluded] of statusPairs){
  const r=assessNflTeamInjuryEvidence({teams,groups:[
   {...den,injuries:[{...player,status}]},kc
  ]});
  assert.equal(r.blockedIds.has("123"),excluded,status);
 }
});
test("ambiguous duplicate team IDs do not confer game-day clearance",()=>{
 const r=assessNflTeamInjuryEvidence({teams:[teams[0],teams[0]],groups:[den,kc]});
 assert.equal(r.checked,false);
});
test("NFL market route requires full injury coverage before upgrading source books",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(src.includes("assessNflTeamInjuryEvidence({teams:expectedTeams,groups:summaryInjuries})"));
 assert.ok(src.includes("groups:[...summaryInjuries,...leagueGroups]"));
 assert.ok(src.includes("eligibility.injuryFeedChecked===true&&roles.checked===true"));
 assert.ok(src.includes("injuryEligibilityChecked:eligibility.checked&&eligibility.injuryFeedChecked===true"));
 assert.ok(src.includes("analyticsSgpsPublishable:false"));
 assert.ok(!src.includes("injuryFeedChecked=Array.isArray(d.injuries)&&d.injuries.length>0"));
});

test("conflicting ESPN team IDs and abbreviations cannot clear both opponents",()=>{
 const spoof={team:{id:"4",abbreviation:"KC"},injuries:[]};
 const r=assessNflTeamInjuryEvidence({teams,groups:[den,spoof]});
 assert.equal(r.checked,false);
 assert.deepEqual(r.coveredTeams,["DEN"]);
});
