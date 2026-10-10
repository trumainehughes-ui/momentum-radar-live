import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isBackupQbForVerifiedGame} from "../lib/ai-mechanics/nfl-qb-selection.js";

const qbs=[
 {playerID:"qb-starter",name:"Sample Starter",team:"DEN",position:"QB"},
 {playerID:"qb-backup",name:"Sample Backup",team:"DEN",position:"QB"},
 {playerID:"qb-away",name:"Visiting QB",team:"KC",position:"QB"}
];
const starter={playerId:"qb-starter",name:"Sample Starter",team:"DEN",
  position:"QB",starterVerified:true,recommendationEligible:true,
  verification:{role:{verified:true}}};
const verified={checked:true,players:[starter]};
test("per-game verified QB1 excludes only this team's backup by ESPN ID",()=>{
 assert.equal(isBackupQbForVerifiedGame(qbs[0],verified),false);
 assert.equal(isBackupQbForVerifiedGame(qbs[1],verified),true);
 assert.equal(isBackupQbForVerifiedGame(qbs[2],verified),false);
});
test("missing injury/role status or no proven starter cannot label anyone backup",()=>{
 for(const gate of [
  {checked:false,players:[starter]},
  {checked:true,players:[{...starter,starterVerified:false}]},
  {checked:true,players:[{...starter,recommendationEligible:false}]},
  {checked:true,players:[]}
 ]) assert.equal(isBackupQbForVerifiedGame(qbs[1],gate),false);
});
test("conflicting or duplicated game starter evidence never chooses one at random",()=>{
 const gate={checked:true,players:[starter,{...starter,playerId:"qb-backup"}]};
 assert.equal(isBackupQbForVerifiedGame(qbs[0],gate),false);
 assert.equal(isBackupQbForVerifiedGame(qbs[1],gate),false);
});
test("same cached ESPN analytics objects remain intact across different game reviews",()=>{
 const before=JSON.stringify(qbs);
 const first=qbs.filter(q=>!isBackupQbForVerifiedGame(q,verified));
 assert.deepEqual(first.map(q=>q.playerID),["qb-starter","qb-away"]);
 const later=qbs.filter(q=>!isBackupQbForVerifiedGame(q,
   {checked:true,players:[{...starter,starterVerified:false}]}));
 assert.equal(later.length,3);
 assert.equal(JSON.stringify(qbs),before);
 assert.equal("_excludeBackupQb" in qbs[1],false);
});
test("NFL market builder never mutates shared analytics cached player rows",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.ok(src.includes("analytics.filter(a=>!isBackupQbForVerifiedGame(a,roles))"));
 assert.ok(!src.includes("x._excludeBackupQb=true"));
 assert.ok(!src.includes("analytics.filter(a=>!a._excludeBackupQb)"));
 assert.ok(src.includes("v81-game-specific-immutable-qb1"));
});
