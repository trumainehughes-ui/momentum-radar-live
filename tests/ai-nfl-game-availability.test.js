import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../api/nfl-game.js";
import { nflPlayerAvailability, assessNflTeamInjuryEvidence } from "../lib/ai-mechanics/nfl-injury-evidence.js";

const teams=[{id:"1",abbr:"DEN"},{id:"2",abbr:"KC"}];
const playerId="11", name="Sample Quarterback";
const groups=[
 {team:{id:"1",abbreviation:"DEN"},injuries:[]},
 {team:{id:"2",abbreviation:"KC"},injuries:[]}
];
function status(override={}){
 const ev=assessNflTeamInjuryEvidence({teams,groups});
 return nflPlayerAvailability({playerId,name,injuryEvidence:ev,...override});
}
test("player availability is verified only with two-team injury coverage",()=>{
 assert.deepEqual(status(),{status:"ACTIVE_ROTATION",verified:true,eligible:true});
 const partial=assessNflTeamInjuryEvidence({teams,groups:[groups[0]]});
 assert.deepEqual(nflPlayerAvailability({playerId,name,injuryEvidence:partial}),
 {status:"UNVERIFIED",verified:false,eligible:false});
});
test("known OUT and QUESTIONABLE stay excluded with partial injury responses",()=>{
 const partial=assessNflTeamInjuryEvidence({teams,groups:[
  {team:{id:"1",abbreviation:"DEN"},injuries:[
   {athlete:{id:"11",displayName:name},status:"Out"}]}
 ]});
 assert.deepEqual(nflPlayerAvailability({playerId,name,injuryEvidence:partial}),
   {status:"OUT",verified:false,eligible:false});
 assert.deepEqual(nflPlayerAvailability({playerId:"12",name:"Another Player",
   injuryEvidence:partial,questionableIds:new Set(["12"])}),
   {status:"QUESTIONABLE",verified:false,eligible:false});
});
test("a name-only OUT report still blocks the matching roster player",()=>{
 const partial=assessNflTeamInjuryEvidence({teams,groups:[
 {team:{id:"1",abbreviation:"DEN"},injuries:[
  {athlete:{displayName:name},status:"Injured Reserve"}]},groups[1]]});
 assert.equal(nflPlayerAvailability({playerId,name,injuryEvidence:partial}).eligible,false);
});
test("availability overrides never become proof of an active roster",()=>{
 const s=status({overrideBlockedIds:new Set(["11"])});
 assert.equal(s.status,"OUT");
 assert.equal(s.eligible,false);
});
function response(){
 return {statusCode:200,body:null,headers:{},
 setHeader(k,v){this.headers[k]=v;return this},
 status(code){this.statusCode=code;return this},
 json(value){this.body=value;return this}};
}
function fixture(groupsOverride){
 const row=(id,abbr,homeAway)=>({team:{id,abbreviation:abbr,displayName:abbr},homeAway});
 const athlete=(id,displayName)=>({id,displayName,position:{abbreviation:"QB"}});
 const roster=(abbr,id)=>({team:{abbreviation:abbr},roster:[
   {athlete:athlete(id,abbr+" Starting QB"),starter:true}
 ]});
 const summary={
   header:{competitions:[{date:"2026-10-11T19:00:00Z",competitors:[
     row("1","DEN","home"),row("2","KC","away")]}]},
   injuries:groupsOverride,rosters:[roster("DEN","11"),roster("KC","21")]
 };
 const rosters={
   DEN:{athletes:[{items:[athlete("11","DEN Starting QB"),
     athlete("12","DEN Backup QB")]}]},
   KC:{athletes:[{items:[athlete("21","KC Starting QB")]}]}
 };
 return {summary,rosters};
}
async function runGame(mockGroups){
 const backup=globalThis.fetch;
 const {summary,rosters}=fixture(mockGroups);
 try{
  globalThis.fetch=async input=>{
   const url=String(input);
   let body;
   if(url.includes("/summary?event="))body=summary;
   else if(url.endsWith("/injuries"))throw Error("injury_fallback_unavailable");
   else if(url.includes("/teams/DEN/roster"))body=rosters.DEN;
   else if(url.includes("/teams/KC/roster"))body=rosters.KC;
   else throw Error("unexpected_ESPN_request:"+url);
   return {ok:true,status:200,json:async()=>body};
  };
  const r=response();
  await handler({method:"GET",query:{gameId:"test-game-2026"},body:null},r);
  return r;
 }finally{globalThis.fetch=backup}
}
test("NFL game endpoint accepts two-team structured injury report, but no sportsbook verification",async()=>{
 const r=await runGame(groups);
 assert.equal(r.statusCode,200,JSON.stringify(r.body));
 assert.equal(r.body.eligibility.injuryFeedChecked,true);
 assert.equal(r.body.eligibility.ready,true);
 assert.deepEqual(r.body.eligibility.injuryCoveredTeams,["DEN","KC"]);
 const p=r.body.playerProjections.find(p=>p.playerId==="11");
 assert.equal(p.availability,"ACTIVE_ROTATION");
 assert.equal(p.verification.availability.verified,true);
 assert.equal(p.verification.sportsbook.verified,false);
 assert.equal(r.body.starterEvidence.gameId,"test-game-2026");
 assert.equal(r.body.starterEvidence.source,
   "ESPN selected-game roster: explicit starter booleans with matching athlete IDs");
 assert.equal(r.body.starterEvidence.sportsbookPriceConfirmed,false);
 assert.ok(Array.isArray(r.body.starterEvidence.confirmedQbTeams));
 assert.equal(r.body.starterEvidence.missingQbTeams.length+
   r.body.starterEvidence.confirmedQbTeams.length,2);
});
test("NFL game endpoint fails closed when only one team's injury report is available",async()=>{
 const r=await runGame([groups[0]]);
 assert.equal(r.statusCode,200,JSON.stringify(r.body));
 assert.equal(r.body.eligibility.ready,false);
 assert.equal(r.body.eligibility.injuryFeedChecked,false);
 const p=r.body.playerProjections.find(p=>p.playerId==="11");
 assert.equal(p.availability,"UNVERIFIED");
 assert.equal(p.verification.availability.verified,false);
 assert.equal(p.recommendationEligible,false);
 assert.equal(p.starterVerified,false);
});
test("NFL game endpoint excludes unavailable roster players even on a partial feed",async()=>{
 const injured={team:{id:"1",abbreviation:"DEN"},injuries:[
 {athlete:{id:"11",displayName:"DEN Starting QB"},status:"Out"}]};
 const r=await runGame([injured]);
 assert.equal(r.statusCode,200,JSON.stringify(r.body));
 assert.equal(r.body.eligibility.ready,false);
 assert.equal(r.body.playerProjections.some(p=>p.playerId==="11"),false);
});
test("NFL game source wiring shares exact two-team match with sportsbook source",()=>{
 const src=readFileSync(new URL("../api/nfl-game.js",import.meta.url),"utf8");
 assert.ok(src.includes("assessNflTeamInjuryEvidence({"));
 assert.ok(src.includes("injuryGroups=[...summaryInjuryGroups,...leagueGroups]"));
 assert.ok(src.includes("availability=av.status"));
 assert.ok(src.includes("starterEligible=officialStarter&&av.eligible"));
 assert.ok(src.includes("ready:injuryEvidence.checked&&roleRosterCovered"));
 assert.ok(!src.includes("availability:{verified:true,status:availability"));
});

test("market and UI expose the actual number of independent confirmed QBs",()=>{
 const market=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(market.includes("starterEvidence:d.starterEvidence||null"));
 assert.ok(market.includes('starterSourceState:roles.starterEvidence?.state||"UNAVAILABLE"'));
 assert.ok(market.includes("confirmedQuarterbackTeams:roles.starterEvidence?.confirmedQbTeams||[]"));
 assert.ok(ui.includes("Confirmed starting QBs: "));
 assert.ok(ui.includes("d.bookMarketAudit?.starterSourceState"));
});
