import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 NFL_SGP_TIERS,assessNflSgpTier,selectNflAdaptiveTier,
 classifyNflSgpOdds
} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

const players=[
 {playerID:'qb1',name:'Starting QB',cat:'passing',projection:220,analyticsThreshold:260},
 {playerID:'wr1',name:'Starting WR',cat:'receiving',projection:60,analyticsThreshold:80},
 {playerID:'rb1',name:'Starting RB',cat:'rushing',projection:65,analyticsThreshold:85},
 {playerID:'wr1',name:'Starting WR',cat:'td',projection:null,analyticsThreshold:'Anytime TD'},
 {playerID:'te1',name:'Starting TE',cat:'receptions',projection:4,analyticsThreshold:6},
 {playerID:'wr2',name:'Other WR',cat:'receiving',projection:45,analyticsThreshold:65},
 {playerID:'rb2',name:'Other RB',cat:'rushing',projection:43,analyticsThreshold:65},
 {playerID:'te2',name:'Other TE',cat:'receptions',projection:3,analyticsThreshold:5}
];
test('tier leg counts and diversity follow requested risk levels',()=>{
 const ranges={Small:[2,3],Medium:[3,4],Large:[3,5],Nuke:[5,8]};
 for(const [risk,[min,max]] of Object.entries(ranges)){
  assert.equal(NFL_SGP_TIERS[risk].minLegs,min);
  assert.equal(NFL_SGP_TIERS[risk].maxLegs,max);
  assert.equal(assessNflSgpTier({risk,legs:players.slice(0,min),requiredLegs:min}).compositionOk,true);
  assert.equal(assessNflSgpTier({risk,legs:players.slice(0,min-1),requiredLegs:min-1}).compositionOk,false);
  assert.equal(assessNflSgpTier({risk,legs:players.slice(0,max),requiredLegs:max}).compositionOk,true);
 }
});
test('same athlete different markets are two independent selections',()=>{
 const valid=[players[0],players[1],players[3]];
 assert.equal(valid[1].playerID,valid[2].playerID);
 assert.notEqual(valid[1].cat,valid[2].cat);
 assert.equal(assessNflSgpTier({risk:'Small',legs:valid,requiredLegs:3}).compositionOk,true);
 const bad=[valid[0],valid[1],{...valid[1],analyticsThreshold:75}];
 assert.equal(assessNflSgpTier({risk:'Small',legs:bad,requiredLegs:3}).compositionOk,false);
});
test('small, medium and nuke adaptive generator never chooses shorter than the public tier',()=>{
 for(const risk of ['Small','Medium','Large','Nuke']){
  const calls=[];
  const card=selectNflAdaptiveTier((r,count)=>{
   calls.push(count);
   const legs=players.slice(0,count);
   return{risk:r,legs,tierAssessment:assessNflSgpTier({risk:r,legs,requiredLegs:count}),
    requiredLegs:count,combinedBookQuoteVerified:false,
    publishable:false,sgpScore:80};
  },risk);
  assert.equal(card.legs.length,NFL_SGP_TIERS[risk].minLegs);
  assert.ok(calls.every(n=>n>=NFL_SGP_TIERS[risk].minLegs&&n<=NFL_SGP_TIERS[risk].maxLegs));
  assert.equal(card.combinedBookQuoteVerified,false);
  assert.equal(card.selectionObjective,'MODEL_RESEARCH_ONLY_PRICE_NOT_VERIFIED');
 }
});
test('Nuke $10 stake requires a bookmaker-issued combined price at or above +10000',()=>{
 assert.equal(classifyNflSgpOdds(9999),'OUTSIDE_TIER_BANDS');
 assert.equal(classifyNflSgpOdds(10000),'Nuke');
 assert.equal(classifyNflSgpOdds(10001),'Nuke');
 assert.equal(classifyNflSgpOdds(3000),'OUTSIDE_TIER_BANDS');
});
test('market builder and public serializer count each athlete-market, not just athlete',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const publicView=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 const status=readFileSync(new URL('../lib/nfl-sgp-snapshot-status.js',import.meta.url),'utf8');
 assert.match(api,/used\.has\(id\+'\\|'\+x\.cat\)/);
 assert.match(api,/used\.add\(id\+'\\|'\+x\.cat\)/);
 assert.match(api,/used\.has\(x\.playerID\+'\\|'\+x\.cat\)/);
 assert.match(publicView,/const identity=playerIdentity\+'\\|'\+marketIdentity/);
 assert.match(status,/legs\.length>=tier\.minLegs&&legs\.length<=tier\.maxLegs/);
});
