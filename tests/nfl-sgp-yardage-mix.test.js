import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessNflSgpTier,fillNflSgpMarketMix} from "../lib/ai-mechanics/nfl-sgp-tiers.js";

const td=[
 {name:"Justin Jefferson",playerID:"jj",cat:"td"},
 {name:"Chris Olave",playerID:"co",cat:"td"},
 {name:"Devaughn Vele",playerID:"dv",cat:"td"},
 {name:"Noah Fant",playerID:"nf",cat:"td"},
 {name:"Juwan Johnson",playerID:"jw",cat:"td"}
];
const yards=[
 {name:"Vikings QB",playerID:"qb-min",cat:"passing",analyticsThreshold:240},
 {name:"Saints QB",playerID:"qb-no",cat:"passing",analyticsThreshold:220},
 {name:"Vikings RB",playerID:"rb-min",cat:"rushing",analyticsThreshold:65},
 {name:"Saints RB",playerID:"rb-no",cat:"rushing",analyticsThreshold:50},
 {name:"Vikings WR",playerID:"wr-min",cat:"receiving",analyticsThreshold:60},
 {name:"Saints WR",playerID:"wr-no",cat:"receiving",analyticsThreshold:50},
 {name:"Vikings TE",playerID:"te-min",cat:"receptions",analyticsThreshold:4},
 ...td
];
function select(risk,count,pool=yards,blocked=new Set()){
 const legs=[],used=new Set();
 const result=fillNflSgpMarketMix({risk,count,pool,legs,add:x=>{
  if(blocked.has(x.playerID)||used.has(x.playerID))return false;
  used.add(x.playerID);legs.push(x);return true;
 }});
 return {...result,legs};
}
test("MIN-NO screenshot's four and five anytime TD builds fail Small and Medium",()=>{
 const small=assessNflSgpTier({risk:"Small",legs:td.slice(0,4),requiredLegs:4});
 const medium=assessNflSgpTier({risk:"Medium",legs:td,requiredLegs:5});
 assert.equal(small.compositionOk,false);
 assert.equal(medium.compositionOk,false);
 assert.equal(small.yardageLegs,0);
 assert.equal(medium.yardageLegs,0);
 assert.equal(medium.tdLegs,5);
 assert.match(medium.reason,/3\+ passing\/rushing\/receiving yardage legs/);
});
test("Small starts with two distinct yardage markets and max one touchdown",()=>{
 const s=select("Small",4);
 assert.equal(s.filled,true);
 assert.equal(s.legs.length,4);
 assert.ok(["passing","rushing","receiving"].includes(s.legs[0].cat));
 assert.ok(["passing","rushing","receiving"].includes(s.legs[1].cat));
 assert.notEqual(s.legs[0].cat,s.legs[1].cat);
 assert.ok(s.assessment.yardageLegs>=2);
 assert.ok(s.assessment.yardageMarketCount>=2);
 assert.ok(s.assessment.tdLegs<=1);
});
test("Medium starts with 3 yardage legs and allows no more than one TD",()=>{
 const s=select("Medium",5);
 assert.equal(s.filled,true);
 assert.equal(s.legs.length,5);
 assert.ok(s.legs.slice(0,3).every(x=>["passing","rushing","receiving"].includes(x.cat)));
 assert.ok(s.assessment.yardageLegs>=3);
 assert.ok(s.assessment.yardageMarketCount>=2);
 assert.ok(s.assessment.tdLegs<=1);
});
test("Nuke also has 3 or more yardage legs and at most 2 anytime TD",()=>{
 const s=select("Nuke",6);
 assert.equal(s.filled,true);
 assert.ok(s.assessment.yardageLegs>=3);
 assert.ok(s.assessment.tdLegs<=2);
});
test("TD-only input cannot be padded into a complete SGP for any tier",()=>{
 for(const [risk,count] of [["Small",4],["Medium",5],["Nuke",5]]){
  const s=select(risk,count,td);
  assert.equal(s.filled,false,risk);
  assert.equal(s.assessment.yardageLegs,0);
  assert.ok(s.assessment.tdLegs<=2);
  assert.match(s.reason,/Await valid yardage/);
 }
});
test("if passing is unavailable, rushing and receiving can form the yardage base",()=>{
 const s=select("Small",4,yards,new Set(["qb-min","qb-no"]));
 assert.equal(s.filled,true);
 assert.ok(s.legs.some(x=>x.cat==="rushing"));
 assert.ok(s.legs.some(x=>x.cat==="receiving"));
 assert.equal(s.assessment.yardageMarketCount,2);
});
test("receptions cannot substitute for the yardage minimum",()=>{
 const pool=[
  {name:"Vikings WR",playerID:"v1",cat:"receptions"},
  {name:"Saints TE",playerID:"s1",cat:"receptions"},...td
 ];
 const s=select("Small",4,pool);
 assert.equal(s.filled,false);
 assert.equal(s.assessment.yardageLegs,0);
});
test("the production hotfix refuses partial model tier cards instead of showing a TD-only slate",()=>{
 const api=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(api.includes("if(!tierAssessment.compositionOk)return{book:'Combined'"));
 assert.ok(api.includes("legs:[],tierAssessment,modelOnly:true,candidateComplete:false"));
 assert.ok(api.includes("const mix=fillNflSgpMarketMix({risk,count,pool:riskPool,legs,add})"));
 assert.ok(api.includes("const mix=fillNflSgpMarketMix({risk,count,pool:rotated,legs,add})"));
});
