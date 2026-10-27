import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches}
 from '../lib/nfl-official-transaction-holds.js';
import {nflInjuryRecommendationHold} from '../lib/nfl-injury-evidence.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';
const date='2026-10-15',gameId='401872995',now=Date.parse('2026-10-15T14:00:00Z');
const price={playerID:'4685512',name:'Jadarian Price',team:'SEA',
 position:'RB',eventID:gameId,category:'rushing',projection:50,
 perGame:39.7,gamesPlayed:3};
function sample(status){
 const legs=[{...price,cat:'rushing',analyticsThreshold:50},
  {playerID:'501',name:'Example QB',team:'DEN',position:'QB',eventID:gameId,
   cat:'passing',analyticsThreshold:220},
  {playerID:'502',name:'Example WR',team:'DEN',position:'WR',eventID:gameId,
   cat:'receiving',analyticsThreshold:50},
  {playerID:'503',name:'Example TE',team:'SEA',position:'TE',eventID:gameId,
   cat:'td',analyticsThreshold:'Anytime TD'}];
 return{at:now-60_000,body:{ok:true,date,gameId,home:'SEA',away:'DEN',
  validation:{injuryEligibilityChecked:true,injuryEvidence:status?[{name:'Jadarian Price',
   playerId:'4685512',team:'SEA',status,section:'WEEKLY'}]:[]},
  categories:{rushing:[price],passing:[],receiving:[],receptions:[],td:[]},
  sgps:{Analytics:[{risk:'Small',requiredLegs:4,
   tierAssessment:{compositionOk:true},legs}],DraftKings:[],FanDuel:[]}}};
}
test('Seahawks Oct 3 official IR hold blocks Price throughout Seattle vs Denver and does not auto-expire at 4 games',()=>{
 for(const day of ['2026-10-04','2026-10-11','2026-10-15','2026-10-18','2026-10-22']){
  const holds=nflOfficialTransactionHolds({date:day,gameId,home:'SEA',away:'DEN'});
  assert.equal(holds.length,1);
  assert.equal(holds[0].name,'Jadarian Price');
  assert.equal(holds[0].playerId,'4685512');
  assert.equal(holds[0].status,'IR');
  assert.equal(nflOfficialHoldMatches(price,holds[0]),true);
 }
 assert.deepEqual(nflOfficialTransactionHolds({date:'2026-10-02',gameId,home:'SEA',away:'DEN'}),[]);
 assert.deepEqual(nflOfficialTransactionHolds({date,gameId,home:'NYG',away:'DEN'}),[]);
});
test('any current injury-list status holds player except independent verified ACTIVE game clearance',()=>{
 for(const status of ['IR','OUT','INACTIVE','DOUBTFUL','QUESTIONABLE','PROBABLE','UNKNOWN','REPORTED_OTHER']){
  assert.equal(nflInjuryRecommendationHold({name:'Other Player',status,section:'WEEKLY'}),true,status);
 }
 assert.equal(nflInjuryRecommendationHold({status:'ACTIVE',section:'TRACKER',
  gameDesignationVerified:false}),true);
 assert.equal(nflInjuryRecommendationHold({status:'ACTIVE',section:'WEEKLY',
  gameDesignationVerified:true}),false);
 assert.equal(nflInjuryRecommendationHold({status:'IR',section:'RESERVE',
  gameDesignationVerified:true}),true);
});
test('existing saved public Seattle SGP drops entire affected tier and reports official injury',()=>{
 for(const status of [null,'QUESTIONABLE','IR']){
  const view=publicNflGameView(sample(status),{date,gameId,now});
  assert.equal(view.status,'CURRENT');
  assert.equal(view.categories.rushing.some(x=>x.name==='Jadarian Price'),false);
  assert.equal(view.parlays.length,0);
  assert.ok(view.injuries.some(x=>x.name==='Jadarian Price'&&x.status==='IR'));
  assert.ok(!JSON.stringify(view.parlays).includes('Jadarian Price'));
 }
});
test('market/role/current public pipeline enforce hold before SGP selection and new cache version',()=>{
 const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const game=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 const pub=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 const dayAhead=readFileSync(new URL('../lib/nfl-day-ahead-roles.js',import.meta.url),'utf8');
 const slate=readFileSync(new URL('../lib/nfl-slate-rankings.js',import.meta.url),'utf8');
 assert.ok(market.includes('nflInjuryRecommendationHold(x)'));
 assert.ok(market.includes('blockedIds.add(hold.playerId)'));
 assert.ok(market.includes('blockedNames.add(norm(hold.name))'));
 assert.ok(market.includes('pruneSgpsForEligibility('));
 assert.ok(dayAhead.includes('eligibility.blockedIds?.has(id)'));
 assert.ok(game.includes('scopedInjuries.filter(nflInjuryRecommendationHold)'));
 assert.ok(pub.includes('nflInjuryRecommendationHold(x)'));
 assert.ok(slate.includes('nflInjuryRecommendationHold')||slate.includes('blockedIds')||slate.includes('blockedNames'));
 assert.ok(market.includes('injury-list-hardgate-v1'));
});
