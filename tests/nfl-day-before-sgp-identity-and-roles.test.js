import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflDayAheadRoleEvidence} from '../lib/nfl-day-ahead-roles.js';
import {nflCurrentRosterAthletes} from '../lib/nfl-roster-evidence.js';
import {guardFinalNflSgpCards,nflLegMatchesGameRoster,assessNflSgpTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

const gameId='401900555',home='JAX',away='PHI';
const athletes=[
 {id:'1011',name:'Jacksonville Back',team:'JAX',position:'RB'},
 {id:'1012',name:'Jacksonville Receiver',team:'JAX',position:'WR'},
 {id:'1013',name:'Jacksonville Tight End',team:'JAX',position:'TE'},
 {id:'1014',name:'Jacksonville Quarterback',team:'JAX',position:'QB'},
 {id:'2011',name:'Philadelphia Receiver',team:'PHI',position:'WR'},
 {id:'2012',name:'Philadelphia Back',team:'PHI',position:'RB'},
 {id:'2013',name:'Philadelphia Tight End',team:'PHI',position:'TE'}
];
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const eligibility={
 checked:true,injuryChecked:true,blockedIds:new Set(),blockedNames:new Set(),
 rosterById:new Map(athletes.map(a=>[a.id,{id:a.id,name:a.name,team:a.team,pos:a.position}])),
 rosterByName:new Map(athletes.map(a=>[norm(a.name),{id:a.id,name:a.name,team:a.team,pos:a.position}]))
};
const makeStat=(i,category,overrides={})=>({
 playerID:athletes[i].id,name:athletes[i].name,
 team:athletes[i].team,position:athletes[i].position,
 eventID:gameId,opponent:athletes[i].team==='JAX'?'PHI':'JAX',
 gamesPlayed:4,category,perGame:category==='rushing'?65:category==='passing'?215:55,
 projection:category==='rushing'?65:category==='passing'?215:55,
 range:{ceiling:category==='rushing'?110:95},usagePerGame:{
  rushYards:athletes[i].position==='RB'?65:8,
  recYards:athletes[i].position!=='RB'?55:18,targets:4,receptions:3
 },...overrides
});
const gate=()=>({checked:true,roles:new Map(athletes.flatMap(a=>{
 const p={playerId:a.id,name:a.name,team:a.team,position:a.position,
  availability:'UNREPORTED',starterVerified:false,starterStatus:'UNVERIFIED_ROLE',
  recommendationEligible:false,verification:{availability:{verified:true}}};
 return[[a.id,p],['name:'+norm(a.name),p]];
}))});
const statBoards={passing:[makeStat(3,'passing')],rushing:[makeStat(0,'rushing'),makeStat(5,'rushing')],
 receiving:[makeStat(1,'receiving'),makeStat(2,'receiving'),makeStat(4,'receiving'),makeStat(6,'receiving')],
 receptions:[makeStat(1,'receptions'),makeStat(2,'receptions'),makeStat(4,'receptions')]};
test('ESPN current team roster supports both position-grouped and flat athlete rows',()=>{
 for(const form of [
  {athletes:[{position:{abbreviation:'RB'},items:[{id:'1011',displayName:'Jacksonville Back'}]}]},
  {athletes:[{id:'1011',displayName:'Jacksonville Back'}]},
  {athletes:[{position:{abbreviation:'RB'},athletes:[{athlete:{id:'1011',displayName:'Jacksonville Back'}}]}]},
  {team:{roster:{athletes:[{athlete:{id:'1011',displayName:'Jacksonville Back'}}]}}}
 ]){
  const out=nflCurrentRosterAthletes(form);
  assert.equal(out.length,1);
  assert.equal(out[0].id,'1011');
 }
 assert.equal(nflCurrentRosterAthletes({athletes:[{id:'hacker',displayName:'Bogus'}]}).length,0);
});
test('prior empty SGPs do not falsely report ESPN identity failure for all Small Medium Nuke tiers',()=>{
 const input={Analytics:['Small','Medium','Nuke'].map(risk=>({
  risk,legs:[],requiredLegs:risk==='Small'?4:5,tierAssessment:{compositionOk:false},
  reason:'Insufficient verified rushing/receiving yardage candidates'
 }))};
 const out=guardFinalNflSgpCards(input,{gameId,home,away,rosterChecked:true,
  rosterById:eligibility.rosterById,rosterByName:eligibility.rosterByName,
  normalizeName:norm});
 for(const card of out.Analytics){
  assert.equal(card.legs.length,0);
  assert.ok(card.reason.includes('Insufficient verified rushing'));
  assert.ok(!card.reason.includes('identity could not be verified'));
  assert.equal(card.gameIdentityVerified,false);
 }
});
test('a wrong-game/player-identity candidate still fails completely; empty fix never lowers safety',()=>{
 const wrong={risk:'Small',requiredLegs:4,legs:[
  makeStat(0,'rushing',{eventID:'999999999'}),
  makeStat(1,'receiving'),makeStat(2,'receptions'),makeStat(5,'rushing')
 ]};
 const result=guardFinalNflSgpCards({Analytics:[wrong]},{gameId,home,away,
  rosterChecked:true,rosterById:eligibility.rosterById,
  rosterByName:eligibility.rosterByName,normalizeName:norm});
 assert.equal(result.Analytics[0].legs.length,0);
 assert.equal(result.Analytics[0].tierAssessment.status,'GAME_OR_ROSTER_IDENTITY_UNVERIFIED');
 assert.equal(nflLegMatchesGameRoster(wrong.legs[0],{gameId,home,away,
  rosterChecked:true,rosterById:eligibility.rosterById,
  rosterByName:eligibility.rosterByName,normalizeName:norm}),false);
});
test('day-before verified 2026 roster+completed-game usage unlocks conditional RB/WR/TE only',()=>{
 const out=nflDayAheadRoleEvidence({gameId,home,away,eligibility,gate:gate(),statBoards});
 assert.equal(out.source,'ESPN_GAME_SCOPED_USAGE_AND_DEPTHCHART');
 assert.ok(out.counters.projectedHighUsageRoles>=5);
 for(const a of athletes.filter(x=>x.position!=='QB')){
  const r=out.roles.get(a.id);
  assert.equal(r.recommendationEligible,true,a.name);
  assert.equal(r.starterVerified,false,'prior season usage may never confirm a starter');
  assert.equal(r.confirmedStarter,false);
  assert.equal(r.roleConfidence,'CONDITIONAL_DAY_AHEAD');
  assert.equal(r.verification.role.verified,false);
 }
 const qb=out.roles.get('1014');
 assert.equal(qb.recommendationEligible,false,'QB1 must be separately confirmed');
 assert.equal(out.counters.unconfirmedQuarterback,1);
});
test('questionable, OUT or cross-team players remain excluded even with high season production',()=>{
 const bad={...eligibility,blockedIds:new Set(['1011']),
  blockedNames:new Set([norm('Philadelphia Receiver')])};
 const day=nflDayAheadRoleEvidence({gameId,home,away,
  eligibility:bad,gate:gate(),statBoards});
 assert.equal(day.roles.get('1011').recommendationEligible,false);
 assert.equal(day.roles.get('2011').recommendationEligible,false);
 const r=gate();r.roles.get('1012').availability='QUESTIONABLE';
 const uncertain=nflDayAheadRoleEvidence({gameId,home,away,eligibility,gate:r,statBoards});
 assert.equal(uncertain.roles.get('1012').recommendationEligible,false);
 const moved=nflDayAheadRoleEvidence({gameId,home,away,eligibility,
  gate:gate(),statBoards:{rushing:[makeStat(0,'rushing',{team:'PHI'})]}});
 assert.equal(moved.roles.get('1011').recommendationEligible,false);
 assert.ok(moved.counters.missingRosterOrGameIdentity>0);
});
test('two prior games and actual opportunity are mandatory for conditional role',()=>{
 const onlyOne=nflDayAheadRoleEvidence({gameId,home,away,eligibility,gate:gate(),
  statBoards:{rushing:[makeStat(0,'rushing',{gamesPlayed:1})]}});
 assert.equal(onlyOne.roles.get('1011').recommendationEligible,false);
 const noUsage=nflDayAheadRoleEvidence({gameId,home,away,eligibility,gate:gate(),
  statBoards:{receiving:[makeStat(1,'receiving',{usagePerGame:{targets:0,recYards:0,receptions:0}})]}});
 assert.equal(noUsage.roles.get('1012').recommendationEligible,false);
 const noInjuryReport=nflDayAheadRoleEvidence({gameId,home,away,
  eligibility:{...eligibility,checked:false},gate:gate(),statBoards});
 assert.equal(noInjuryReport.source,'NOT_READY');
 assert.equal(noInjuryReport.counters.projectedHighUsageRoles,0);
});
test('game SGP code imports conditional evidence, but keeps strict verified-QB and 5-yard model targets',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(api.includes("nflDayAheadRoleEvidence({"));
 assert.ok(api.includes('roles.roles=dayAheadRoles.roles'));
 assert.ok(api.includes('conditionalRolesNotConfirmedStarters:true'));
 assert.ok(api.includes("isNflConfirmedGameQb({position:pos,role})"));
 assert.ok(api.includes("-day-ahead-roles-v4-game-scope-qb1"));
 assert.ok(html.includes('Day-before conditional model'));
 assert.ok(html.includes('NOT officially confirmed starters'));
 assert.ok(!/priceVerified:true|combinedBookSgpQuoteAvailable:true/.test(api));
});
