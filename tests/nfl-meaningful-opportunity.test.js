import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflMeaningfulOpportunity} from '../lib/nfl-meaningful-opportunity.js';

const role={recommendationEligible:true,starterVerified:false,
 starterStatus:'PROJECTED_HIGH_USAGE_ROLE',availability:'UNREPORTED',
 verification:{role:{verified:false}}};
const mk=(name,position,gamesPlayed,targets)=>({name,position,gamesPlayed,
 usagePerGame:{targets}});
test('rotation receiver without 4+ completed-game targets cannot enter SGP',()=>{
 const jaylin=mk('Jaylin Noel','WR',5,3.4);
 assert.equal(nflMeaningfulOpportunity(jaylin,role),false);
 assert.equal(nflMeaningfulOpportunity({...jaylin,usagePerGame:{targets:4}},role),true);
 assert.equal(nflMeaningfulOpportunity(mk('Low sample','TE',2,9),role),false);
});
test('verified starter is eligible even if current targets are lower',()=>{
 const authenticated={...role,starterVerified:true,
  starterStatus:'CONFIRMED_STARTER',verification:{role:{verified:true}}};
 assert.equal(nflMeaningfulOpportunity(mk('Starting wideout','WR',5,3.6),authenticated),true);
 assert.equal(nflMeaningfulOpportunity(mk('Projected only','WR',5,3.6),role),false);
});
test('running back with six-plus actual carries is meaningful',()=>{
 const x={name:'Woody Marks',position:'RB',gamesPlayed:5,
  usagePerGame:{targets:2.6,rushYards:29.8}};
 const pairedTd={gamesPlayed:5,rushingAttempts:43,
  usagePerGame:{targets:2.6}};
 assert.equal(nflMeaningfulOpportunity(x,role,{pairedTd}),true);
 assert.equal(nflMeaningfulOpportunity(x,role),false);
 assert.equal(nflMeaningfulOpportunity(x,role,{
  pairedTd:{gamesPlayed:5,rushingAttempts:25}}),false);
});
test('a sportsbook listing never overrides questionable or inactive player',()=>{
 const x=mk('Parker Washington','WR',5,7);
 for(const bad of ['OUT','IR','QUESTIONABLE','SUSPENDED','DOUBTFUL']){
  assert.equal(nflMeaningfulOpportunity({...x,injuryStatus:bad},role),false,bad);
 }
 assert.equal(nflMeaningfulOpportunity(x,{...role,recommendationEligible:false}),false);
});
test('QB roster presence alone is not a confirmed start',()=>{
 const qb=mk('Backup passer','QB',5,0);
 assert.equal(nflMeaningfulOpportunity(qb,role),false);
 assert.equal(nflMeaningfulOpportunity(qb,{
  ...role,starterVerified:true,verification:{role:{verified:true}}}),true);
});
test('both book-priced and model-generated SGP pipelines enforce opportunity',()=>{
 const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(source,/if\(!nflMeaningfulOpportunity\(x,verifiedRole,\{pairedTd\}\)\)continue/);
 assert.match(source,/if\(!nflMeaningfulOpportunity\(x,r,\{pairedTd\}\)\)/);
 assert.match(source,/insufficientOpportunity/);
});
