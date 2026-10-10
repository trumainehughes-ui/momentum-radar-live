import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterKnownNflIneligibleRows,isKnownNflIneligible} from "../lib/ai-mechanics/nfl-known-ineligible.js";
import {assessNflTeamInjuryEvidence,nflPlayerAvailability} from "../lib/ai-mechanics/nfl-injury-evidence.js";
import {pruneNflSgpsForEligibility} from "../lib/ai-mechanics/nfl-sgp-eligibility.js";

const teams=[{id:"4",abbr:"DEN"},{id:"12",abbr:"KC"}];
const den={team:{id:"4",abbreviation:"DEN"},injuries:[
  {athlete:{id:"11",displayName:"Unavailable Receiver"},status:"Out"},
  {athlete:{id:"12",displayName:"Pending Runner"},status:"Questionable"}
]};
const injury=assessNflTeamInjuryEvidence({teams,groups:[den]});
const marketRows=[
 {playerID:"11",name:"Unavailable Receiver",team:"DEN",analyticsOnly:true},
 {playerID:"12",name:"Pending Runner",team:"DEN",analyticsOnly:true},
 {playerID:"13",name:"Eligible Quarterback",team:"DEN",analyticsOnly:true}
];
test("even a partial injury feed preserves explicit OUT and QUESTIONABLE evidence",()=>{
 assert.equal(injury.checked,false);
 assert.equal(injury.blockedIds.has("11"),true);
 assert.equal(injury.questionableIds.has("12"),true);
 assert.equal(injury.questionableNames.has("PENDINGRUNNER"),true);
 assert.deepEqual(filterKnownNflIneligibleRows(marketRows,injury).map(x=>x.playerID),["13"]);
});
test("unverified feed does not independently certify the remaining model player",()=>{
 const info=nflPlayerAvailability({playerId:"13",name:"Eligible Quarterback",injuryEvidence:injury});
 assert.equal(info.verified,false);
 assert.equal(info.eligible,false);
 assert.equal(info.status,"UNVERIFIED");
 const questionable=nflPlayerAvailability({playerId:"12",name:"Pending Runner",injuryEvidence:injury});
 assert.equal(questionable.status,"QUESTIONABLE");
 assert.equal(questionable.eligible,false);
});
test("known unavailable player is removed from a model even when full report fails",()=>{
 const sgps={Analytics:[{risk:"Small",requiredLegs:2,
   legs:[{name:"Unavailable Receiver",playerID:"11",cat:"receiving"},
     {name:"Eligible Quarterback",playerID:"13",cat:"passing"}],
   estimatedOdds:2100,actualSgpOdds:2000,candidateComplete:true,publishable:true}],
   DraftKings:[{risk:"Nuke",requiredLegs:2,
   legs:[{name:"Pending Runner",playerID:"12",cat:"rushing"},
     {name:"Eligible Quarterback",playerID:"13",cat:"passing"}],
   estimatedOdds:14000,nukePayoutVerified:true}]};
 const output=pruneNflSgpsForEligibility(sgps,injury);
 for(const arr of Object.values(output)){
  const s=arr[0];
  assert.equal(s.legs.length,1);
  assert.equal(s.eligibilityPruned,true);
  assert.equal(s.estimatedOdds,null);
  assert.equal(s.actualSgpOdds,null);
  assert.equal(s.candidateComplete,false);
  assert.equal(s.publishable,false);
  assert.equal(s.nukePayoutVerified,false);
 }
});
test("all known injury statuses independently block model picks",()=>{
 for(const status of ["OUT","QUESTIONABLE","DOUBTFUL","INACTIVE","IR",
   "INJURED_RESERVE","SUSPENDED","PUP","NFI"]){
   assert.equal(isKnownNflIneligible({playerID:"p",name:"Test",injuryStatus:status}),true,status);
 }
 assert.equal(isKnownNflIneligible({playerID:"p",name:"Test",injuryStatus:"ACTIVE"}),false);
});
test("name-only injury report still blocks a model row without a matching ESPN ID",()=>{
 const reported=assessNflTeamInjuryEvidence({teams,groups:[
   {team:{id:"4",abbreviation:"DEN"},injuries:[
     {athlete:{displayName:"Known Receiver"},status:"Out"}]}
   ]});
 assert.equal(filterKnownNflIneligibleRows([
   {playerID:"new-player-id",name:"Known Receiver"},
   {playerID:"other-id",name:"Active Player"}
 ],reported).length,1);
});
test("bad inputs are safe and do not create a fake active-market filter",()=>{
 assert.deepEqual(filterKnownNflIneligibleRows(undefined,injury),[]);
 assert.equal(isKnownNflIneligible(null,injury),true);
 assert.deepEqual(pruneNflSgpsForEligibility(null,injury),{});
});
test("NFL market code applies known exclusions before incomplete-roster fallback",()=>{
 const source=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(source.includes("const safeRows=filterKnownNflIneligibleRows(rows,elig)"));
 assert.ok(source.includes("if(!elig?.checked)return safeRows"));
 assert.ok(source.includes("const {blockedIds,blockedNames,questionableIds,questionableNames}=injuryEvidence"));
 assert.ok(source.includes("v81-game-specific-immutable-qb1"));
});
