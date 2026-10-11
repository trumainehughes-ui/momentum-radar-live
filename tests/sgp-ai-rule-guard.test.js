import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAiSgpRules} from '../lib/sgp-ai-rule-guard.js';
import {LEAGUE_SGP_TARGETS,LEAGUE_SGP_LEG_BOUNDS} from '../lib/sgp-tier-contract.js';
const gameId='401872981';
const types=['rushing','passing','receiving','receptions','rushing','passing','td'];
const targets=[50,225,65,4,80,250,'Anytime TD'],regular=[70,270,90,6,105,285,null],
 ceiling=[35,195,50,2,65,215,null];
const leg=(cat,i,risk)=>({
 name:'Athlete '+i,playerID:String(501+i),team:'JAX',eventID:gameId,cat,
 position:cat==='passing'?'QB':'RB',
 analyticsThreshold:targets[i],predictiveProjection:risk==='Nuke'?ceiling[i]:regular[i]
});
const make=(risk,count)=>types.slice(0,count).map((cat,i)=>leg(cat,i,risk));
const review=(risk,legs,league='nfl')=>validateAiSgpRules({
 league,risk,gameId,legs,requiredLegs:legs.length});
test('NFL Small/Medium/Nuke AI candidates inherit exact counts, categories, TD caps and documented payout bands',()=>{
 for(const [risk,count] of [['Small',4],['Medium',5],['Nuke',6]]){
  const checked=review(risk,make(risk,count));
  assert.equal(checked.valid,true,risk+': '+checked.rules.join(','));
  assert.equal(checked.canPublish,false);
  assert.equal(checked.canSetOdds,false);
  assert.deepEqual(checked.targetOdds,LEAGUE_SGP_TARGETS[risk]);
  assert.deepEqual(checked.allowedLegs,[...LEAGUE_SGP_LEG_BOUNDS.nfl[risk]]);
 }
});
test('AI cannot change Small/Medium/Nuke leg counts or hide an all-touchdown SGP in any tier',()=>{
 for(const [risk,legCount] of [['Small',3],['Medium',4],['Nuke',8]]){
  const candidate=make('Nuke',Math.min(legCount,7));
  if(legCount===8)candidate.push({...candidate[0],playerID:'999',name:'Extra Athlete'});
  const outcome=review(risk,candidate);
  assert.equal(outcome.valid,false);
  assert.ok(outcome.rules.includes('TIER_LEG_COUNT'));
 }
 const allTd=make('Medium',5).map(l=>({...l,cat:'td',
  analyticsThreshold:'Anytime TD'}));
 const result=review('Medium',allTd);
 assert.equal(result.valid,false);
 assert.ok(result.rules.includes('TOO_MANY_ANYTIME_TOUCHDOWNS'));
 assert.ok(result.rules.includes('INSUFFICIENT_PASS_RUSH_RECEIVE_MIX'));
});
test('AI cannot propose arbitrary NFL yardage, repeated same-player markets, or 3+ props for one athlete',()=>{
 let x=make('Small',4);x[0].analyticsThreshold=57;
 assert.ok(review('Small',x).rules.includes('NFL_YARDS_NOT_MULTIPLE_OF_FIVE'));
 x=make('Small',4);x[1].playerID=x[0].playerID;
 x[2].playerID=x[0].playerID;
 assert.ok(review('Small',x).rules.includes('TOO_MANY_LEGS_SAME_PLAYER'));
 x=make('Small',4);x[1].playerID=x[0].playerID;
 x[1].cat='rushing';x[1].analyticsThreshold=55;
 assert.ok(review('Small',x).rules.includes('DUPLICATE_PLAYER_STAT_CATEGORY'));
 x=make('Small',4);x[0].eventID='401999999';
 assert.ok(review('Small',x).rules.includes('PLAYER_TEAM_GAME_IDENTITY'));
 x=make('Small',4);x[0].injuryStatus='OUT';
 assert.ok(review('Small',x).rules.includes('INELIGIBLE_PLAYER_STATUS'));
});
test('Nuke yardage must be above measured model projections with meaningful lift',()=>{
 const x=make('Nuke',6);x[1].analyticsThreshold=200; // +5 above passing projection 195
 assert.ok(review('Nuke',x).rules.includes('NUKE_YARDAGE_LIFT_TOO_LOW'));
 x[1].analyticsThreshold=195;
 assert.ok(review('Nuke',x).rules.includes('NUKE_NOT_ABOVE_MODEL_PROJECTION'));
 x[1].analyticsThreshold=225;
 x[2].predictiveProjection=undefined;x[2].projection=undefined;x[2].perGame=undefined;
 assert.ok(review('Nuke',x).rules.includes('NUKE_NOT_ABOVE_MODEL_PROJECTION'));
});
test('NBA AI respects its own 2-3/3-5/5-7 counts, diverse stat categories and elevated Nuke lines',()=>{
 const cats=['points','rebounds','assists','threes','pra','points','rebounds'];
 const nba=(risk,n)=>cats.slice(0,n).map((cat,i)=>({
  name:'NBA Athlete '+i,playerID:String(i+700),team:'LAL',eventID:gameId,
  cat,analyticsThreshold:15+i*5,
  predictiveProjection:risk==='Nuke'?10+i*5:20+i*5
 }));
 for(const [risk,n] of [['Small',2],['Medium',4],['Nuke',5]]){
  const result=review(risk,nba(risk,n),'nba');
  assert.equal(result.valid,true,JSON.stringify(result.rules));
  assert.deepEqual(result.allowedLegs,[...LEAGUE_SGP_LEG_BOUNDS.nba[risk]]);
 }
 const duplicate=nba('Small',2);duplicate[1].cat='points';
 assert.ok(review('Small',duplicate,'nba').rules.includes('INSUFFICIENT_NBA_STAT_DIVERSITY'));
 const bad=nba('Nuke',5);bad[3].analyticsThreshold=bad[3].predictiveProjection;
 assert.ok(review('Nuke',bad,'nba').rules.includes('NUKE_NOT_ABOVE_MODEL_PROJECTION'));
});
