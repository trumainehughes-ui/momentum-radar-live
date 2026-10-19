import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishedNflModelTier} from '../lib/nfl-public-model-sgp-serializer.js';
import {assessNflSgpTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
import {nflSgpSnapshotReadiness} from '../lib/nfl-sgp-snapshot-status.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';
const date='2026-10-18',gameId='401872996',at=Date.parse('2026-10-18T12:00:00Z');
const athlete=[
 ['C.J. Stroud','1','HOU','QB','passing',300],
 ['Parker Washington','2','JAX','WR','receiving',75],
 ['Woody Marks','3','HOU','RB','rushing',45],
 ['Brenton Strange','4','JAX','TE','receptions',4.3],
 ['Parker Washington','2','JAX','WR','td',null]
];
const leg=([name,playerID,team,position,cat,projection])=>({
 name,playerID,team,position,cat,eventID:gameId,
 projection:cat==='td'?'Anytime TD':projection,
 analyticsThreshold:cat==='td'?'Anytime TD':Math.ceil(projection||0),
});
const row=([name,playerID,team,position,cat,projection])=>({
 name,playerID,team,position,eventID:gameId,category:cat,
 ...(cat==='td'?{modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',
  modelTdPercent:42,evidence:{games:5,opportunitiesPerGame:7,touchdowns:3},
  gamesPlayed:5}:{projection,gamesPlayed:5}),
 reason:'Completed-game matchup projection, not a sportsbook price.'
});
function card(risk,count){
 const legs=athlete.slice(0,count).map(leg);
 return{risk,legs,requiredLegs:count,
  tierAssessment:assessNflSgpTier({risk,legs,requiredLegs:count}),
  publishable:false,combinedBookQuoteVerified:false,
  explanation:{summary:'Completed-game evidence; prices are separate.'}};
}
function snapshot(){
 const sgps={DraftKings:[],FanDuel:[],Analytics:[
  publishedNflModelTier(card('Small',4)),
  publishedNflModelTier(card('Medium',5)),
  publishedNflModelTier(card('Nuke',5))
 ]};
 const categories=Object.fromEntries(['td','passing','rushing','receiving','receptions']
  .map(cat=>[cat,athlete.filter(x=>x[4]===cat).map(row)]));
 return{at,body:{ok:true,scope:'game',date,gameId,home:'JAX',away:'HOU',
  validation:{injuryEligibilityChecked:true},categories,sgps}};
}
test('all three tiers retain requiredLegs and true composition after sanitize',()=>{
 for(const [risk,count] of [['Small',4],['Medium',5],['Nuke',5]]){
  const p=publishedNflModelTier(card(risk,count));
  assert.ok(p);
  assert.equal(p.mode,'MODEL_ONLY');
  assert.equal(p.requiredLegs,count);
  assert.equal(p.tierAssessment.compositionOk,true);
  assert.equal(p.legs.length,count);
  assert.ok(p.legs.every(x=>x.target===null&&x.marketSelectionStatus));
  assert.equal(p.combinedBookQuoteVerified,false);
  assert.equal(p.actualSgpOdds,null);
 }
});
test('public snapshot preserves 4/5/5 tier counts but flags repeated markets across tiers',()=>{
 const raw=snapshot();
 assert.equal(raw.body.sgps.Analytics.length,3);
 const status=nflSgpSnapshotReadiness(raw,{now:at+20_000,gameId});
 assert.deepEqual(status.tiers.map(x=>x.legCount),[4,5,5]);
 assert.ok(status.tiers.every(x=>x.status==='MODEL_CANDIDATE'));
 const view=publicNflGameView(raw,{date,gameId,now:at+20_000});
 assert.equal(view.status,'CURRENT');
 assert.deepEqual(view.modelResearchTiers.map(x=>x.legCount),[4,5,5]);
 assert.equal(view.modelResearchTiers[0].complete,true);
 assert.ok(view.modelResearchTiers.slice(1).some(x=>x.complete===false&&x.diversityStatus==='REBUILD_REQUIRED_DUPLICATE_MARKETS'));
 assert.equal(view.verifiedQuotes.length,0);
 assert.equal(view.verifiedBookParlays.length,0);
});
test('same player receiving and TD survive serialization as separate markets',()=>{
 const p=publishedNflModelTier(card('Medium',5));
 const receiving=p.legs.find(x=>x.player==='Parker Washington'&&x.category==='receiving');
 const td=p.legs.find(x=>x.player==='Parker Washington'&&x.category==='td');
 assert.ok(receiving);assert.ok(td);
 assert.equal(receiving.player,td.player);
 assert.equal(p.legs.length,5);
});
test('invalid partial tier, duplicate market or invented bookmaker payout rejected',()=>{
 const partial=card('Medium',4);
 assert.equal(publishedNflModelTier(partial),null);
 const repeated=card('Small',4);
 repeated.legs[3]={...repeated.legs[1]};
 repeated.tierAssessment.compositionOk=true;
 assert.equal(publishedNflModelTier(repeated),null);
 const wrong=card('Nuke',5);
 wrong.tierAssessment.compositionOk=false;
 assert.equal(publishedNflModelTier(wrong),null);
});
test('active route serializes exactly once without deleting tier metadata',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(api,/\.map\(publishedNflModelTier\)\.filter\(Boolean\)/);
 assert.match(api,/c\.tierAssessment\?\.compositionOk===true/);
 assert.match(api,/Number\(c\.requiredLegs\)===c\.legs\.length/);
});
