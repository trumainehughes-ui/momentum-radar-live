import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileEspnGameStarters } from "../lib/ai-mechanics/nfl-game-starter-source.js";

const now=Date.parse("2026-10-11T15:45:00Z"),kickoff=Date.parse("2026-10-11T17:00:00Z");
const competitors=[
 {homeAway:"home",team:{id:"4",abbreviation:"DEN"}},
 {homeAway:"away",team:{id:"12",abbreviation:"KC"}}
];
const rosterCandidates=[
 {playerId:"p1",name:"Example Denver QB",team:"DEN",position:"QB"},
 {playerId:"p2",name:"Example Backup QB",team:"DEN",position:"QB"},
 {playerId:"p3",name:"Example Kansas City QB",team:"KC",position:"QB"}
];
const groups=[
 {team:{id:"4",abbreviation:"DEN"},roster:[
  {athlete:{id:"p1",displayName:"Example Denver QB"},starter:true},
  {athlete:{id:"p2",displayName:"Example Backup QB"},role:"Starting Quarterback"}
 ]},
 {team:{id:"12",abbreviation:"KC"},roster:[
  {athlete:{id:"p3",displayName:"Example Kansas City QB"},isStarter:true}
 ]}
];
const input={gameId:"game-1",sourceGameId:"game-1",competitors,
  rosters:groups,rosterCandidates,blockedIds:new Set(),now,kickoff};
test("explicit ESPN game roster starter booleans verify exact source player IDs",()=>{
 const result=reconcileEspnGameStarters(input);
 assert.deepEqual(result.map(p=>p.playerId),["p1","p3"]);
 assert.equal(result[0].kind,"STRUCTURED");
 assert.equal(result[0].checkedAt,new Date(now).toISOString());
 assert.equal(result[0].evidenceKind,"EXPLICIT_GAME_STARTER_FLAG");
});
test("role strings, names and depth-chart hints cannot impersonate an explicit starter",()=>{
 const spoof={...groups[0],roster:[
  {athlete:{id:"p2",displayName:"Example Backup QB"},role:"starter",status:{type:{name:"Starter"}}}
 ]};
 assert.deepEqual(reconcileEspnGameStarters({...input,rosters:[spoof]}),[]);
});
test("mismatched athlete ID cannot borrow the name of a confirmed QB",()=>{
 const spoof={...groups[0],roster:[
  {athlete:{id:"p2",displayName:"Example Denver QB"},starter:true}
 ]};
 assert.deepEqual(reconcileEspnGameStarters({...input,rosters:[spoof]}),[]);
});
test("opponent injury/roster mismatches cannot certify an unrequested team",()=>{
 const spoof={...groups[0],team:{id:"4",abbreviation:"KC"}};
 assert.deepEqual(reconcileEspnGameStarters({...input,rosters:[spoof]}),[]);
});
test("wrong source game and past kickoff never inherit historical starter flags",()=>{
 assert.deepEqual(reconcileEspnGameStarters({...input,sourceGameId:"other-game"}),[]);
 assert.deepEqual(reconcileEspnGameStarters({...input,now:kickoff+1000}),[]);
 assert.deepEqual(reconcileEspnGameStarters({...input,kickoff:now+8*24*3600000}),[]);
 assert.deepEqual(reconcileEspnGameStarters({...input,kickoff:now+91*60*1000}),[]);
});
test("known unavailable players cannot be marked verified starters",()=>{
 const r=reconcileEspnGameStarters({...input,blockedIds:new Set(["p1"])});
 assert.deepEqual(r.map(x=>x.playerId),["p3"]);
});
test("ambiguous duplicate player IDs or two starting QBs for one team fail closed",()=>{
 const duplicate=reconcileEspnGameStarters({...input,
   rosterCandidates:[...rosterCandidates,rosterCandidates[0]]});
 assert.deepEqual(duplicate.map(x=>x.playerId),["p3"]);
 const double={...groups[0],roster:[
  groups[0].roster[0],
  {athlete:{id:"p2",displayName:"Example Backup QB"},starter:true}
 ]};
 const r=reconcileEspnGameStarters({...input,rosters:[double,groups[1]]});
 assert.deepEqual(r.map(x=>x.playerId),["p3"]);
});
test("NFL API now reconciles structured source player IDs instead of text matching",()=>{
 const src=readFileSync(new URL("../api/nfl-game.js",import.meta.url),"utf8");
 assert.ok(src.includes("signals=reconcileEspnGameStarters("));
 assert.ok(src.includes("sourceGameId:summary?.header?.competitions?.[0]?.id"));
 assert.ok(src.includes("const byId=new Map(signals.map(s=>[s.playerId,s]))"));
 assert.ok(!src.includes("toLowerCase().includes('starter')"));
});
