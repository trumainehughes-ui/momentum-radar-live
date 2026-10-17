import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {estimateNflHitChance,nflHitTarget,nflHitChanceValid}
 from '../lib/nfl-model-hit-chance.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';

const date='2026-10-12',gameId='401872994',now=Date.parse('2026-10-12T20:50:00Z');
const row=(cat,projection,sample=[230,270,265,310,295,305])=>({
 name:'Model Sample',playerID:'1234567',team:'BUF',position:'QB',
 eventID:gameId,category:cat,perGame:sample.reduce((a,b)=>a+b,0)/sample.length,
 projection,predictiveProjection:projection,gamesPlayed:sample.length,
 recentForm:{last5:sample.slice(-5),last10:sample}
});
test('target labels match five-yard NFL increments and integer receptions',()=>{
 assert.equal(nflHitTarget('passing',318),320);
 assert.equal(nflHitTarget('receiving',88),90);
 assert.equal(nflHitTarget('rushing',104),105);
 assert.equal(nflHitTarget('receptions',4.2),5);
 assert.equal(nflHitTarget('td','Anytime TD'),'Anytime TD');
 assert.equal(nflHitTarget('passing',null),null);
});
test('completed-game variation creates a real estimated chance of reaching a SPECIFIC target',()=>{
 for(const [cat,proj,history] of [
  ['passing',320,[280,310,345,290,330,355]],
  ['rushing',105,[72,97,125,89,104,135]],
  ['receiving',80,[55,68,90,70,108,96]],
  ['receptions',6.1,[3,5,7,6,8,6]]
 ]){
  const fixture=row(cat,proj,history);
  const near=estimateNflHitChance(fixture,cat);
  const harder=estimateNflHitChance(fixture,cat,{
    target:cat==='receptions'?near.target+3:near.target+50});
  assert.equal(near.calibrated,false);
  assert.equal(near.modelOnly,true);
  assert.ok(near.percent>0&&near.percent<100);
  assert.ok(harder.percent<near.percent,cat);
  assert.equal(near.target,nflHitTarget(cat,proj));
  assert.equal(near.sampleGames,history.length);
  assert.ok(nflHitChanceValid(near,cat,near.target));
 }
});
test('changing Momentum rating never changes probability',()=>{
 const original=row('passing',320,[270,310,320,345,355]);
 const high=estimateNflHitChance({...original,momentumScore:96},'passing');
 const low=estimateNflHitChance({...original,momentumScore:12},'passing');
 assert.deepEqual(high,low);
 assert.notEqual(high.percent,96);
});
test('no three-game sample, incomplete production, or invalid thresholds => no percentage',()=>{
 const baseline=row('receiving',85,[70,96]);
 assert.equal(estimateNflHitChance(baseline,'receiving'),null);
 const missing={...row('passing',300),perGame:null};
 assert.equal(estimateNflHitChance(missing,'passing'),null);
 const empty={...row('rushing',90),recentForm:{last5:[]}};
 assert.equal(estimateNflHitChance(empty,'rushing'),null);
 assert.equal(estimateNflHitChance(row('passing',300),'passing',{target:307}),null);
});
test('touchdown probability is distinct from ranking score and requires actual TD model evidence',()=>{
 const td={...row('td','Anytime TD'),modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',
   evidence:{games:5,opportunitiesPerGame:14.2},modelTdPercent:58,momentumScore:95};
 const r=estimateNflHitChance(td,'td');
 assert.equal(r.percent,58);
 assert.equal(r.target,'Anytime TD');
 assert.equal(r.calibrated,false);
 assert.equal(estimateNflHitChance({...td,tdModelStatus:'UNVERIFIED'},'td'),null);
 assert.equal(estimateNflHitChance({...td,evidence:{games:1,opportunitiesPerGame:14}},'td'),null);
});
test('SGP exact Nuke threshold has lower hit probability than same player small line',()=>{
 const p=row('passing',320,[280,310,345,290,330,355]);
 const small=estimateNflHitChance(p,'passing',{target:265});
 const nuke=estimateNflHitChance(p,'passing',{target:345});
 assert.ok(small.percent>nuke.percent);
 assert.equal(small.target,265);
 assert.equal(nuke.target,345);
});
test('public game exposes matching hit percentages on player and SGP cards without publishing scores',()=>{
 const passing=row('passing',320,[280,310,345,290,330,355]);
 const td={...row('td',null),name:'Example RB',playerID:'7654321',
  position:'RB',category:'td',modelOnly:true,
  tdModelStatus:'ESPN_MATCHUP_MODEL',modelTdPercent:54,
  evidence:{games:5,opportunitiesPerGame:15,touchdowns:3}};
 const pLeg=(cat,target,name='Model Sample',id='1234567',team='BUF')=>({
  ...row(cat,cat==='passing'?320:cat==='receiving'?90:cat==='rushing'?100:4,
   cat==='passing'?[280,310,345,290,330,355]:[35,55,65,40,70,60]),
  cat,team,name,playerID:id,analyticsThreshold:target
 });
 const legs=[pLeg('passing',265),pLeg('rushing',70,'Other RB','2'),
  pLeg('receiving',55,'Other WR','3'),
  {...td,cat:'td',analyticsThreshold:'Anytime TD'}];
 const saved={at:now-60000,body:{
  ok:true,date,gameId,home:'LAR',away:'BUF',
  validation:{injuryEligibilityChecked:true,injuryEvidence:[]},
  categories:{passing:[passing],rushing:[],receiving:[],receptions:[],td:[td]},
  sgps:{Analytics:[{risk:'Small',tierAssessment:{compositionOk:true},
   legs}],DraftKings:[],FanDuel:[]}
 }};
 const v=publicNflGameView(saved,{date,gameId,now});
 assert.equal(v.status,'CURRENT');
 assert.equal(v.categories.passing[0].hitTarget,320);
 assert.equal(v.categories.passing[0].hitProbabilityPct,
  estimateNflHitChance(passing,'passing').percent);
 assert.equal(v.categories.td[0].hitProbabilityPct,54);
 assert.ok(v.parlays[0].legs[0].hitProbabilityPct>
  v.categories.passing[0].hitProbabilityPct);
 assert.equal(v.parlays[0].legs[3].hitProbabilityPct,54);
 assert.ok(!JSON.stringify(v).includes('momentumRating'));
});
test('owner/public UI and ranking endpoints display same target-based percentage field',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const picks=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const ranks=readFileSync(new URL('../api/public-nfl-rankings.js',import.meta.url),'utf8');
 for(const source of [html,picks])assert.ok(source.includes('hit chance')||source.includes('hit probability'));
 assert.ok(html.includes('const hit=x.hitChance'));
 assert.ok(!html.includes('Momentum rating (not hit probability)'));
 assert.ok(html.includes('nflLegHitChance(x)'));
 assert.ok(picks.includes('function hitChanceText(x,cat)'));
 assert.ok(picks.includes('hitChanceText(x,cat)'));
 assert.ok(picks.includes('sgpSelectionDisplay(l)'));
 assert.ok(picks.includes('sgp-leg-selection'));
 // Hit probabilities stay in player/AI analysis, not customer SGP slips.
 assert.ok(markets.includes('hitChance:estimateNflHitChance(x,cat)'));
 assert.ok(markets.includes('hitChance:estimateNflHitChance(leg,leg.cat,{target:leg.analyticsThreshold})'));
 assert.ok(ranks.includes('hitProbabilityPct:hit?.percent??null'));
 const js=picks.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new vm.Script(js));
});
