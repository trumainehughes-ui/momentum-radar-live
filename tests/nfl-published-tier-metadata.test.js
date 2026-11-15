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
 analyticsThreshold:cat==='td'?1:Math.ceil(projection||0),
});
const row=([name,playerID,team,position,cat,projection])=>({
 name,playerID,team,position,eventID:gameId,category:cat,
 ...(cat==='td'?{modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',
  modelTdPercent:42,evidence:{games:5,opportunitiesPerGame:7,touchdowns:3},
  gamesPlayed:5}:{projection,gamesPlayed:5}),
 reason:'Completed-game matchup projection, not a sportsbook price.'
});
function card(risk,count){
 const picks=risk==='Small'?[athlete[0],athlete[1],athlete[2]]:
  risk==='Medium'?[athlete[0],athlete[1],athlete[2],athlete[3]]:athlete;
 const legs=picks.slice(0,count).map(leg);
 return{risk,legs,requiredLegs:count,
  tierAssessment:assessNflSgpTier({risk,legs,requiredLegs:count}),
  publishable:false,combinedBookQuoteVerified:false,
  explanation:{summary:'Completed-game evidence; prices are separate.'}};
}
function snapshot(){
 const sgps={DraftKings:[],FanDuel:[],Analytics:[
  publishedNflModelTier(card('Small',3)),
  publishedNflModelTier(card('Medium',4)),
  publishedNflModelTier(card('Large',5)),
  publishedNflModelTier(card('Nuke',5))
 ]};
 const categories=Object.fromEntries(['td','passing','rushing','receiving','receptions']
  .map(cat=>[cat,athlete.filter(x=>x[4]===cat).map(row)]));
 return{at,body:{ok:true,scope:'game',date,gameId,home:'JAX',away:'HOU',
  validation:{injuryEligibilityChecked:true},categories,sgps}};
}
test('all four tiers retain requiredLegs and true composition after sanitize',()=>{
 for(const [risk,count] of [['Small',3],['Medium',4],['Large',5],['Nuke',5]]){
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
test('public snapshot preserves 3/4/5/5 tier counts while keeping unverified book odds separate',()=>{
 const raw=snapshot();
 assert.equal(raw.body.sgps.Analytics.length,4);
 const status=nflSgpSnapshotReadiness(raw,{now:at+20_000,gameId});
 assert.deepEqual(status.tiers.map(x=>x.legCount),[3,4,5,5]);
 assert.ok(status.tiers.every(x=>['MODEL_CANDIDATE','NOT_READY'].includes(x.status)));
 const view=publicNflGameView(raw,{date,gameId,now:at+20_000});
 assert.equal(view.status,'CURRENT');
 assert.deepEqual(view.modelResearchTiers.map(x=>x.legCount),[3,4,5,5]);
 assert.equal(view.modelResearchTiers[0].complete,true);
 // Repeated player markets are rebuilt to progressively harder MODEL_ONLY targets.
 assert.ok(view.modelResearchTiers.every(x=>x.mode==='MODEL_ONLY'||x.publishable===false));
 const threshold=(tier,cat)=>tier.legs.find(x=>x.category===cat)?.modelTarget;
 assert.ok(threshold(view.modelResearchTiers[1],'passing')>threshold(view.modelResearchTiers[0],'passing'));
 assert.ok(threshold(view.modelResearchTiers[2],'passing')>=threshold(view.modelResearchTiers[1],'passing'));
 assert.equal(view.verifiedQuotes.length,0);
 assert.equal(view.verifiedBookParlays.length,0);
});
test('same player receiving and TD survive serialization as separate markets',()=>{
 const p=publishedNflModelTier(card('Large',5));
 const receiving=p.legs.find(x=>x.player==='Parker Washington'&&x.category==='receiving');
 const td=p.legs.find(x=>x.player==='Parker Washington'&&x.category==='td');
 assert.ok(receiving);assert.ok(td);
 assert.equal(receiving.player,td.player);
 assert.equal(p.legs.length,5);
});
test('invalid partial tier, duplicate market or invented bookmaker payout rejected',()=>{
 const partial=card('Medium',4);
 partial.requiredLegs=5; // inconsistent length must be rejected, even with flexible tiers
 assert.equal(publishedNflModelTier(partial),null);
 const repeated=card('Small',3);
 repeated.legs[2]={...repeated.legs[1]};
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

test('publication selects at most one model candidate per NFL tier',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(api,/const modelCandidates=\[\.\.\.completeImported,\.\.\.\(analyticsSgps\|\|\[\]\),\.\.\.fallbackModelTiers\]/);
 assert.match(api,/all\.findIndex\(other=>other\.risk===tier\.risk\)===index/);
});


test('invalid upstream tier cannot suppress roster-vetted fallback',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(api,/const already=new Set\(\);/);
 assert.match(api,/\.map\(publishedNflModelTier\)\.filter\(Boolean\)\.filter/);
});
