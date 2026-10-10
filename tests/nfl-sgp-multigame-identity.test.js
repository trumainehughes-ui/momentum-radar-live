import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {guardFinalNflSgpCards} from "../lib/ai-mechanics/nfl-sgp-tiers.js";

function fixture(gameId,home,away){
 const legs=[
 {playerID:gameId+"-qb",name:"Home Quarterback",team:home,opponent:away,eventID:gameId,cat:"passing"},
 {playerID:gameId+"-rb",name:"Visiting Runningback",team:away,opponent:home,eventID:gameId,cat:"rushing"},
 {playerID:gameId+"-wr",name:"Home Receiver",team:home,opponent:away,eventID:gameId,cat:"receiving"},
 {playerID:gameId+"-td",name:"Visiting Receiver",team:away,opponent:home,eventID:gameId,cat:"td"}
 ];
 const rosterById=new Map(legs.map(x=>[x.playerID,{team:x.team,name:x.name}]));
 const rosterByName=new Map(legs.map(x=>[x.name.toUpperCase().replace(/[^A-Z0-9]/g,""),{team:x.team,id:x.playerID}]));
 const game={gameId,home,away,rosterChecked:true,rosterById,rosterByName};
 return {legs,game,card:{risk:"Small",requiredLegs:4,legs,
   estimatedOdds:null,publishable:false,candidateComplete:true}};
}
test("same identity policy accepts three unrelated NFL matchups",()=>{
 for(const [gameId,home,away] of [
  ["401872987","NO","MIN"],
  ["401872981","JAX","PHI"],
  ["401872982","MIA","CIN"]
 ]){
  const {game,card}=fixture(gameId,home,away);
  const sgps=guardFinalNflSgpCards({Analytics:[card]},game);
  assert.equal(sgps.Analytics[0].tierAssessment.compositionOk,true,gameId);
  assert.equal(sgps.Analytics[0].legs.length,4,gameId);
 }
});
test("other-game leg invalidates entire card, never silently swaps in a touchdown",()=>{
 const {game,card}=fixture("401872987","NO","MIN");
 const wrong={...card,legs:card.legs.map((x,i)=>i===1?{...x,eventID:"401872981"}:x)};
 const r=guardFinalNflSgpCards({Analytics:[wrong]},game).Analytics[0];
 assert.deepEqual(r.legs,[]);
 assert.equal(r.publishable,false);
 assert.equal(r.tierAssessment.status,"GAME_OR_ROSTER_IDENTITY_UNVERIFIED");
 assert.match(r.reason,/ESPN event identity/);
});
test("player assigned to an opposing game team or wrong opponent invalidates card",()=>{
 const {game,card}=fixture("401872982","MIA","CIN");
 for(const bad of [{team:"TEN"},{opponent:"TEN"},{team:""}, {eventID:null}]){
  const changed={...card,legs:card.legs.map((x,i)=>i===2?{...x,...bad}:x)};
  const outcome=guardFinalNflSgpCards({Analytics:[changed]},game).Analytics[0];
  assert.equal(outcome.tierAssessment.compositionOk,false,JSON.stringify(bad));
  assert.equal(outcome.legs.length,0);
 }
});
test("unverified or conflicting roster identity never certifies a finished parlay",()=>{
 const {game,card}=fixture("401872981","JAX","PHI");
 for(const input of [
  {...game,rosterChecked:false},
  {...game,rosterById:new Map(),rosterByName:new Map()},
  {...game,rosterById:new Map([[card.legs[0].playerID,{team:"PHI",name:card.legs[0].name}]])}
 ]){
  const r=guardFinalNflSgpCards({Analytics:[card]},input).Analytics[0];
  assert.equal(r.publishable,false);
  assert.deepEqual(r.legs,[]);
  assert.equal(r.tierAssessment.status,"GAME_OR_ROSTER_IDENTITY_UNVERIFIED");
 }
});
test("identity validation is independent of the requested Small/Medium/Nuke label",()=>{
 const {game,card}=fixture("401872987","NO","MIN");
 const bad={...card,legs:card.legs.map((x,i)=>i===0?{...x,eventID:"401872981"}:x)};
 const r=guardFinalNflSgpCards({
  Analytics:[bad],
  FanDuel:[{...bad,risk:"Medium",requiredLegs:4}],
  DraftKings:[{...bad,risk:"Nuke",requiredLegs:4}]
 },game);
 for(const book of ["Analytics","FanDuel","DraftKings"]){
  assert.deepEqual(r[book][0].legs,[],book);
  assert.equal(r[book][0].tierAssessment.status,"GAME_OR_ROSTER_IDENTITY_UNVERIFIED");
 }
});
test("production NFL market handler applies game identity gate across all games",()=>{
 const api=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(api.includes("sgps=pruneSgpsForEligibility(sgps,eligibility,{gameId,home,away})"));
 assert.ok(api.includes("rosterChecked:elig?.checked===true"));
 assert.ok(api.includes("CACHE_SCHEMA='v82-honest-provider-status'"));
});
