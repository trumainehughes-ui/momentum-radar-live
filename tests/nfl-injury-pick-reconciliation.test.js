import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {nflGameInjuryEvidence,nflInjuryStatus,nflInjuryExcludesFromPicks,
 nflPlayerBlockedByInjury,nflLeaguePickExclusions} from "../lib/nfl-injury-evidence.js";
import {guardFinalNflSgpCards} from "../lib/ai-mechanics/nfl-sgp-tiers.js";

const teams=[{team:{id:"16",abbreviation:"MIN"}},{team:{id:"18",abbreviation:"NO"}}];
const group=(id,abbr,items=[])=>({team:{id,abbreviation:abbr},injuries:items});
const item=(id,name,status,position="WR")=>({athlete:{id,displayName:name,
 position:{abbreviation:position}},status});
const jeff=item("111","Justin Jefferson","Questionable");
const olave=item("222","Chris Olave","Out");
const good=item("333","Active Runner","Probable","RB");
const now="2026-10-10T18:00:00Z";
const report=(summaryGroups,leagueGroups)=>nflGameInjuryEvidence({
 competitors:teams,summary:{injuries:summaryGroups},
 league:leagueGroups===undefined?null:{injuries:leagueGroups},checkedAt:now
});
test("ESPN structured status objects and reserve/suspension statuses normalize",()=>{
 for(const raw of [{type:{name:"Questionable"}},{name:"OUT"},
   {description:"Reserve/Injured"}]){
  assert.notEqual(nflInjuryStatus(raw),"REPORTED_OTHER",JSON.stringify(raw));
 }
 assert.equal(nflInjuryStatus({type:{name:"Questionable"}}),"QUESTIONABLE");
 assert.equal(nflInjuryStatus("Suspended"),"SUSPENDED");
 assert.equal(nflInjuryExcludesFromPicks("QUESTIONABLE"),true);
 assert.equal(nflInjuryExcludesFromPicks("REVIEW_CONFLICT"),true);
 assert.equal(nflInjuryExcludesFromPicks("PROBABLE"),false);
});
test("partial one-team ESPN report is NOT complete while exclusions remain visible",()=>{
 const r=report([group("16","MIN",[jeff])]);
 assert.equal(r.reportAvailable,false);
 assert.equal(r.teamCoverageVerified,false);
 assert.deepEqual(r.coveredTeams,["MIN"]);
 assert.deepEqual(r.missingTeams,["NO"]);
 assert.equal(r.status,"PARTIAL_REPORT");
 assert.equal(r.pickBlockers.length,1);
 assert.equal(r.injuries[0].status,"QUESTIONABLE");
});
test("reports for both opponents, including empty explicit team, count as coverage",()=>{
 const r=report([group("16","MIN",[jeff,good]),group("18","NO",[olave])]);
 assert.equal(r.reportAvailable,true);
 assert.deepEqual(r.coveredTeams,["MIN","NO"]);
 assert.equal(r.pickBlockers.length,2);
 assert.equal(r.blockers.length,1);
 assert.equal(r.sourceUpdatedAt,null);
 assert.equal(r.officialInactivesVerified,false);
});
test("wrong game ID or conflicting team ID/abbr cannot clear opponent",()=>{
 const r=report([group("16","MIN",[jeff]),group("16","NO",[olave]),
  group("999","KC",[item("999","Other","Out")])]);
 assert.equal(r.reportAvailable,false);
 assert.deepEqual(r.coveredTeams,["MIN"]);
 assert.equal(r.injuries.length,1);
 assert.equal(r.injuries[0].name,"Justin Jefferson");
});
test("unknown ESPN designation remains visibly reported but is held out of props",()=>{
 const unknown=item("222","Chris Olave",{description:"Did not participate"});
 const r=report([group("16","MIN",[]),group("18","NO",[unknown])]);
 assert.equal(r.reportAvailable,true);
 assert.equal(r.injuries[0].status,"REPORTED_OTHER");
 assert.equal(r.pickBlockers.length,1);
});
test("a weaker league report never overrides game-specific OUT",()=>{
 const r=report([group("16","MIN",[item("111","Justin Jefferson","Out")])],
  [group("16","MIN",[item("111","Justin Jefferson","Questionable")]),
  group("18","NO",[])]);
 assert.equal(r.reportAvailable,true);
 assert.equal(r.injuries[0].status,"OUT");
});
test("conflicting playable game status and league reported injury is held out for review",()=>{
 const r=report([group("16","MIN",[item("111","Justin Jefferson","Active")])],
  [group("16","MIN",[item("111","Justin Jefferson","Out")]),group("18","NO",[])]);
 assert.equal(r.injuries[0].status,"REVIEW_CONFLICT");
 assert.equal(r.pickBlockers.length,1);
});
test("player-name and ID safety removes questionable/out from EACH market, only same team",()=>{
 const r=report([group("16","MIN",[jeff]),group("18","NO",[olave])]);
 const cats={td:[{playerID:"111",name:"Justin Jefferson",team:"MIN"}],
  passing:[{playerID:"222",name:"Chris Olave",team:"NO"}],
  rushing:[{playerID:"444",name:"Justin Jefferson",team:"MIN"}],
  receiving:[{playerID:"222",name:"Chris Olave",team:"NO"}],
  receptions:[{playerID:"111",name:"Justin Jefferson",team:"MIN"}]};
 for(const category of Object.values(cats)){
  assert.equal(category.filter(x=>!nflPlayerBlockedByInjury(x,r)).length,0);
 }
 assert.equal(nflPlayerBlockedByInjury(
  {playerID:"999",name:"Justin Jefferson",team:"NO"},r),false);
});
test("final Small/Medium/Nuke SGPs are invalidated when a key player is removed",()=>{
 const r=report([group("16","MIN",[jeff]),group("18","NO",[olave])]);
 const legs=[
 {name:"Vikings QB",playerID:"qb",team:"MIN",cat:"passing"},
 {name:"Vikings RB",playerID:"rb",team:"MIN",cat:"rushing"},
 {name:"Saints WR",playerID:"wr",team:"NO",cat:"receiving"},
 {name:"Justin Jefferson",playerID:"111",team:"MIN",cat:"td"}
 ];
 const blockedIds=new Set(r.pickBlockers.map(x=>x.playerId));
 const blockedNames=new Set(r.pickBlockers.map(x=>x.name.toUpperCase().replace(/[^A-Z0-9]/g,"")));
 const out=guardFinalNflSgpCards({
  Analytics:[{risk:"Small",requiredLegs:4,legs,estimatedOdds:2700,momentumScore:80}],
  DraftKings:[{risk:"Medium",requiredLegs:4,legs,estimatedOdds:4500}]
 },{blockedIds,blockedNames});
 for(const s of [out.Analytics[0],out.DraftKings[0]]){
  assert.equal(s.legs.length,0);
  assert.equal(s.candidateComplete,false);
  assert.equal(s.estimatedOdds,null);
  assert.equal(s.momentumScore,null);
  assert.match(s.reason,/injury or roster change/i);
 }
});
test("both API paths and the UI share strict status/coverage and revalidate every stat",()=>{
 const markets=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 const game=readFileSync(new URL("../api/nfl-game.js",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(markets.includes("for(const x of injury.pickBlockers)"));
 assert.ok(markets.includes("categories[cat]=(categories[cat]||[]).filter(x=>!nflPlayerBlockedByInjury(x,eligibility.injuryReport))"));
 assert.ok(markets.includes("if(gameId&&nflPlayerBlockedByInjury(x,eligibility.injuryReport))return false"));
 assert.ok(markets.includes("v85-injury-pick-reconcile"));
 assert.ok(game.includes("pickBlockers=scopedInjuries.filter"));
 assert.ok(ui.includes("INCOMPLETE INJURY REPORT"));
 assert.ok(ui.includes("Rebuilding Small, Medium and Nuke"));
});


test("forced injury refresh makes older market requests lose the UI race",()=>{
 const src=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(src.includes("nflMarketRequestVersion=new Map(),nflRenderEpoch=new Map()"));
 assert.ok(src.includes("if(!forceFresh&&nflMarketInflight.has(key))"));
 assert.ok(src.includes("if(nflMarketRequestVersion.get(key)===requestVersion)"));
 assert.ok(src.includes("if(nflMarketInflight.get(key)===p)nflMarketInflight.delete(key)"));
 assert.ok(src.includes("if(nflRenderEpoch.get(id)!==renderEpoch"));
 assert.ok(src.includes("nflOpen(gameId,true)"));
});

test("league-wide injury data removes Questionable/Out players from Top 10 stat categories",()=>{
 const league={injuries:[
  group("16","MIN",[jeff]),
  group("18","NO",[olave])
 ]};
 const result=nflLeaguePickExclusions(league,{checkedAt:now});
 assert.equal(result.available,true);
 assert.equal(result.pickBlockers.length,2);
 assert.equal(result.officialInactivesVerified,false);
 assert.equal(nflPlayerBlockedByInjury({playerID:"111",name:"Justin Jefferson",team:"MIN"},result),true);
 assert.equal(nflPlayerBlockedByInjury({playerID:"222",name:"Chris Olave",team:"NO"},result),true);
 assert.equal(nflPlayerBlockedByInjury({playerID:"333",name:"Active Runner",team:"MIN"},result),false);
 const missing=nflLeaguePickExclusions(null,{checkedAt:now});
 assert.equal(missing.available,false);
 assert.equal(missing.status,"REPORT_UNAVAILABLE");
});
test("slate stats are filtered after ESPN analytics merges, not only selected-game props",()=>{
 const api=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(api.includes("const slateInjuries=gameId?null:await"));
 assert.ok(api.includes("const injuryContext=gameId?eligibility.injuryReport:slateInjuries"));
 assert.ok(api.includes("if(gameId||slateInjuries?.available)for(const cat of"));
 assert.ok(api.includes("nflPlayerBlockedByInjury(x,injuryContext)"));
});
