import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {modelNflSgpStatThreshold} from "../lib/ai-mechanics/nfl-sgp-tiers.js";

const cases=[
 {name:"Tyler Shough passing",cat:"passing",projection:325,range:{ceiling:365.2},
  small:225,medium:400,nuke:335,expected:[225,325,350]},
 {name:"Chris Olave receiving",cat:"receiving",projection:135,range:{ceiling:158.6},
  small:110,medium:165,nuke:145,expected:[110,135,145]},
 {name:"Aaron Jones rushing",cat:"rushing",projection:80,range:{ceiling:100.6},
  small:55,medium:85,nuke:90,expected:[55,80,90]}
];
test("real MIN-NO model examples: Medium caps at projection; Nuke exceeds Medium",()=>{
 for(const x of cases){
  const player={projection:x.projection,range:x.range};
  const result=["Small","Medium","Nuke"].map((tier,i)=>
    modelNflSgpStatThreshold(player,x.cat,tier,[x.small,x.medium,x.nuke][i]));
  assert.deepEqual(result,x.expected,x.name);
  assert.ok(result[0]<=result[1],x.name);
  assert.ok(result[1]<result[2],x.name);
  assert.ok(result.every(y=>y%5===0),x.name);
 }
});
test("Nuke is unavailable when even the model ceiling cannot support the required lift",()=>{
 assert.equal(modelNflSgpStatThreshold({projection:60,range:{ceiling:68}},
  "receiving","Nuke",70),null);
 assert.equal(modelNflSgpStatThreshold({projection:59,range:{ceiling:59}},
  "rushing","Nuke",70),null);
 assert.equal(modelNflSgpStatThreshold({projection:160,range:{}},
  "passing","Nuke",200),null);
});
test("receptions remain whole-number props with one-extra Nuke requirement",()=>{
 const p={projection:5.7,range:{ceiling:9.9}};
 const a=["Small","Medium","Nuke"].map((risk,i)=>
   modelNflSgpStatThreshold(p,"receptions",risk,[4,7,7][i]));
 assert.deepEqual(a,[4,5,7]);
});
test("missing/negative evidence does not become a book-verified yardage target",()=>{
 for(const requested of [null,undefined,NaN,-20]){
  assert.equal(modelNflSgpStatThreshold({projection:120,range:{ceiling:155}},
    "receiving","Medium",requested),null);
 }
 assert.equal(modelNflSgpStatThreshold({projection:null,range:{ceiling:160}},
   "receiving","Nuke",140),null);
 assert.equal(modelNflSgpStatThreshold({projection:325,range:{ceiling:365}},
   "touchdowns","Nuke",140),null);
});
test("model-only rules are used for the SGP generator and nuke eligibility",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(src.includes("modelNflSgpStatThreshold(x,x.cat,risk,requested)"));
 assert.ok(src.includes("modelNflSgpStatThreshold(x,x.cat,'Nuke',analyticsLine("));
 assert.ok(src.includes("CACHE_SCHEMA='v85-official-weekly-reconcile'"));
 assert.ok(src.includes("sportsbookVerified:false"));
});
