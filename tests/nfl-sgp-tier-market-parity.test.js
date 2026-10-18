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
 {playerID:'rb2',name:'Other RB',cat:'rushing',projection:43,analyticsThreshold:65}
];
test('only 4-leg Small and 5-leg Medium are valid model compositions',()=>{
 assert.deepEqual([NFL_SGP_TIERS.Small.minLegs,NFL_SGP_TIERS.Small.maxLegs],[4,4]);
 assert.deepEqual([NFL_SGP_TIERS.Medium.minLegs,NFL_SGP_TIERS.Medium.maxLegs],[5,5]);
 assert.deepEqual([NFL_SGP_TIERS.Nuke.minLegs,NFL_SGP_TIERS.Nuke.maxLegs],[5,7]);
 for(const risk of ['Small','Medium','Nuke']){
  assert.equal(assessNflSgpTier({risk,legs:players.slice(0,3),requiredLegs:3}).compositionOk,false);
 }
 assert.equal(assessNflSgpTier({risk:'Small',legs:players.slice(0,4),requiredLegs:4}).compositionOk,true);
 assert.equal(assessNflSgpTier({risk:'Medium',legs:players.slice(0,5),requiredLegs:5}).compositionOk,true);
 assert.equal(assessNflSgpTier({risk:'Nuke',legs:players.slice(0,5),requiredLegs:5}).compositionOk,true);
});
test('same athlete different markets are two independent selections',()=>{
 const valid=players.slice(0,4);
 assert.equal(valid[1].playerID,valid[3].playerID);
 assert.equal(assessNflSgpTier({risk:'Small',legs:valid,requiredLegs:4}).compositionOk,true);
 const bad=[...valid.slice(0,3),{...valid[1],analyticsThreshold:75}];
 assert.equal(assessNflSgpTier({risk:'Small',legs:bad,requiredLegs:4}).compositionOk,false);
});
test('small, medium and nuke adaptive generator never chooses shorter than the public tier',()=>{
 for(const risk of ['Small','Medium','Nuke']){
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
test('Nuke $10 stake requires a book-issued combined price above +10000',()=>{
 assert.equal(classifyNflSgpOdds(10000),'OUTSIDE_TIER_BANDS');
 assert.equal(classifyNflSgpOdds(10001),'Nuke');
 assert.equal(classifyNflSgpOdds(3000),'Medium');
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
