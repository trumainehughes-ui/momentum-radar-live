import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 nflLegMatchesGameRoster, selectNflAdaptiveNuke,
 fillNflSgpMarketMix,assessNflSgpTier,guardFinalNflSgpCards
} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

const gameId='401872981';
const good=[
 {name:'Roster QB',playerID:'1001',team:'PHI',opponent:'JAX',eventID:gameId,cat:'passing',projection:255,analyticsThreshold:310},
 {name:'Roster RB',playerID:'1002',team:'JAX',opponent:'PHI',eventID:gameId,cat:'rushing',projection:70,analyticsThreshold:85},
 {name:'Roster WR',playerID:'1003',team:'PHI',opponent:'JAX',eventID:gameId,cat:'receiving',projection:60,analyticsThreshold:75},
 {name:'Roster TE',playerID:'1004',team:'JAX',opponent:'PHI',eventID:gameId,cat:'receiving',projection:45,analyticsThreshold:60},
 {name:'Roster Other RB',playerID:'1005',team:'PHI',opponent:'JAX',eventID:gameId,cat:'rushing',projection:50,analyticsThreshold:60},
 {name:'Roster TD',playerID:'1006',team:'JAX',opponent:'PHI',eventID:gameId,cat:'td',analyticsThreshold:'Anytime TD'}
];
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const rosters={
 gameId,home:'JAX',away:'PHI',rosterChecked:true,
 rosterById:new Map(good.map(p=>[p.playerID,{team:p.team,name:p.name,id:p.playerID}])),
 rosterByName:new Map(good.map(p=>[norm(p.name),{team:p.team,name:p.name,id:p.playerID}]))
};
test('current roster, proper team, ESPN event and opponent are all required before building a Nuke',()=>{
 for(const p of good)assert.equal(nflLegMatchesGameRoster(p,rosters),true,p.name);
 const p=good[0];
 for(const corrupt of [
 {...p,team:'WAS'}, {...p,team:'JAX'}, {...p,eventID:'401872987'},
 {...p,opponent:'NO'}, {...p,name:'Other athlete'},
 {...p,playerID:'9999'}, {...p,playerID:'1002'}, {...p,team:''}
 ]){
  assert.equal(nflLegMatchesGameRoster(corrupt,rosters),false,JSON.stringify(corrupt));
 }
 assert.equal(nflLegMatchesGameRoster(p,{...rosters,rosterChecked:false}),false);
 assert.equal(nflLegMatchesGameRoster(p,{...rosters,rosterById:new Map()}),false);
});
test('different ESPN nickname aliases do not reject otherwise correct team identity',()=>{
 const p={...good[1],team:'JAC',opponent:'PHI'};
 assert.equal(nflLegMatchesGameRoster(p,rosters),true);
});
const maker=(pool)=> (risk,count)=>{
 const legs=[],used=new Set();
 const mix=fillNflSgpMarketMix({risk,count,pool,legs,add:p=>{
  if(!nflLegMatchesGameRoster(p,rosters)||used.has(p.playerID))return false;
  used.add(p.playerID);legs.push(p);return true;
 }});
 return {risk,legs,tierAssessment:mix.assessment,candidateComplete:mix.filled,
   reason:mix.reason,requiredLegs:count,modelOnly:true,combinedBookQuoteVerified:false};
};
test('Nuke tries 7 then 6 then 5; builds valid five-leg mixed yardage when available',()=>{
 const attempts=[];
 const produce=maker(good.slice(0,5));
 const candidate=selectNflAdaptiveNuke((risk,count)=>{
  attempts.push(count);return produce(risk,count);
 });
 assert.deepEqual(attempts,[7,6,5]);
 assert.equal(candidate.adaptiveLegCount,5);
 assert.equal(candidate.legs.length,5);
 assert.equal(candidate.tierAssessment.compositionOk,true);
 assert.ok(candidate.legs.filter(x=>['passing','rushing','receiving'].includes(x.cat)).length>=3);
 assert.ok(new Set(candidate.legs.map(x=>x.cat)).size>=3);
 assert.ok(candidate.legs.every(x=>x.analyticsThreshold>x.projection));
 assert.equal(candidate.combinedBookQuoteVerified,false);
});
test('Nuke still keeps 7 when all seven valid above-projection options exist',()=>{
 const seven=[...good,{name:'Roster RB Two',playerID:'1007',team:'PHI',opponent:'JAX',eventID:gameId,
    cat:'rushing',projection:40,analyticsThreshold:55}];
 const r2={...rosters,rosterById:new Map([...rosters.rosterById,['1007',{team:'PHI',name:'Roster RB Two',id:'1007'}]]),
 rosterByName:new Map([...rosters.rosterByName,[norm('Roster RB Two'),{team:'PHI',name:'Roster RB Two',id:'1007'}]])};
 const make=(risk,count)=>{
  const legs=[],used=new Set();
  const m=fillNflSgpMarketMix({risk,count,pool:seven,legs,add:p=>{
   if(!nflLegMatchesGameRoster(p,r2)||used.has(p.playerID))return false;
   used.add(p.playerID);legs.push(p);return true;
  }});
  return {risk,legs,requiredLegs:count,tierAssessment:m.assessment,candidateComplete:m.filled};
 };
 const r=selectNflAdaptiveNuke(make);
 assert.equal(r.adaptiveLegCount,7);
 assert.equal(r.legs.length,7);
});
test('insufficient yardage or a Nuke target below projection returns NOT READY rather than fake odds',()=>{
 for(const p of [
  [{...good[0],analyticsThreshold:255},...good.slice(1,5)],
  good.slice(0,2).concat([good[5]])
 ]){
  const r=selectNflAdaptiveNuke(maker(p));
  assert.deepEqual(r.legs,[]);
  assert.equal(r.candidateComplete,false);
  assert.equal(r.combinedBookQuoteVerified,false);
  assert.equal(r.estimatedOdds,null);
  assert.match(r.reason,/supported elevated yardage/);
 }
});
test('final gate rejects cross-game Nuke even when it has six valid categories',()=>{
 const corrupt=[...good.slice(0,5),{...good[5],eventID:'401872987'}];
 const x=guardFinalNflSgpCards({Analytics:[{risk:'Nuke',requiredLegs:6,legs:corrupt}]},rosters).Analytics[0];
 assert.equal(x.tierAssessment.status,'GAME_OR_ROSTER_IDENTITY_UNVERIFIED');
 assert.deepEqual(x.legs,[]);
});
test('market route builds Nuke from vetted roster pool before last-resort presentation check',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(api.includes('if(!nflLegMatchesGameRoster(x,identity))continue;'));
 assert.ok(api.includes("const nuke=selectNflAdaptiveNuke(make);"));
 assert.ok(api.includes('buildAnalyticsSgp(categories,ctx,roles,{gameId,home,away,rosterChecked:'));
 assert.ok(api.includes('sgps=pruneSgpsForEligibility(sgps,eligibility,{gameId,home,away})'));
 assert.ok(api.includes("CACHE_SCHEMA='v87-sgo-backup-only'+'-nuke-roster-adaptive-1'"));
});
