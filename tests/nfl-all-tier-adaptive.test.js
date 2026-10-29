import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNflAdaptiveTier,fillNflSgpMarketMix,modelNflSgpStatThreshold} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const leg=i=>({cat:['passing','rushing','receiving'][i%3],playerID:String(i),projection:100,analyticsThreshold:150});
for(const [risk,minimum] of [['Small',3],['Medium',3],['Large',3],['Nuke',3]]){
 test(risk+' respects minimum complete SGP composition',()=>{
  const selected=selectNflAdaptiveTier((r,n)=>({risk:r,
   legs:Array.from({length:n},(_,i)=>leg(i)),
   tierAssessment:{compositionOk:n>=minimum}}),risk);
  assert.equal(selected.legs.length,minimum);
  assert.equal(selected.adaptiveLegCount,minimum);
 });
}
test('all tiers are wired into NFL market builder and cache',()=>{
 const s=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(s,/selectNflAdaptiveTier\(make,'Small'\)/);
 assert.match(s,/selectNflAdaptiveTier\(make,'Medium'\)/);
 assert.match(s,/selectNflAdaptiveTier\(make,'Large'\)/);
 assert.match(s,/all-tier-adaptive-v1/);
});

test('a verified price must fall within the requested tier band',()=>{
 const make=(risk,n)=>({risk,legs:Array.from({length:n},(_,i)=>leg(i)),tierAssessment:{compositionOk:n===3||n===4},
  combinedBookQuoteVerified:true,publishable:true,actualSgpOdds:n===3?2000:1000,estimatedHitProbability:n===3?.8:.6});
 const picked=selectNflAdaptiveTier(make,'Small');
 assert.equal(picked.adaptiveLegCount,4);
});
test('uncalibrated pseudo-probability cannot outrank a shorter valid Nuke',()=>{
 const make=(risk,n)=>({risk,legs:Array.from({length:n},(_,i)=>leg(i)),
  tierAssessment:{compositionOk:n===5||n===6},
  estimatedHitProbability:n===6?75:0,sgpScore:n===6?90:30});
 const picked=selectNflAdaptiveTier(make,'Nuke');
 assert.equal(picked.adaptiveLegCount,5);
});

test('adaptive tiers never call builder with impossible one- or two-leg requests',()=>{
 for(const risk of ['Small','Medium','Large','Nuke']){
  const calls=[];
  const selected=selectNflAdaptiveTier((r,count)=>{
   calls.push(count);
   return {risk:r,legs:[],tierAssessment:{compositionOk:false}};
  },risk);
  assert.ok(calls.length>0);
  assert.ok(calls.every(count=>count>=3),risk+' attempted impossible candidate');
  assert.deepEqual(selected.legs,[]);
 }
});
test('invalid market mix still returns a failed tier assessment',()=>{
 const mix=fillNflSgpMarketMix({risk:'Small',count:1,pool:[],legs:[],add:()=>false});
 assert.equal(mix.filled,false);
 assert.equal(mix.assessment.compositionOk,false);
});

test('Large generates a conservative evidence-based threshold rather than null',()=>{
 const player={predictiveProjection:105,range:{ceiling:145}};
 assert.equal(modelNflSgpStatThreshold(player,'receiving','Large',100),100);
});
test('TD cannot crowd out required yardage legs',()=>{
 const pool=[
  {cat:'passing',playerID:'1'}, {cat:'rushing',playerID:'2'},
  {cat:'td',playerID:'3'}, {cat:'receiving',playerID:'4'}
 ];
 const legs=[];
 const result=fillNflSgpMarketMix({risk:'Medium',count:3,pool,legs,add:x=>{
  if(legs.some(v=>v.playerID===x.playerID&&v.cat===x.cat))return false;
  legs.push(x);return true;
 }});
 assert.equal(result.filled,true);
 assert.equal(legs.filter(x=>x.cat==='td').length,0);
});
