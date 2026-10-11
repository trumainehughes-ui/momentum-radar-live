import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditLeagueSgpEvent,LEAGUE_SGP_TIERS,LEAGUE_SGP_TARGETS}
 from '../lib/sgp-league-wide-verification.js';
import {auditNflBookSgpMarkets} from '../lib/nfl-sgp-book-market-audit.js';
import {collectorAuditReport} from '../lib/pregame-collector-shards.js';

const makeLeg=(eventID,i,league='nfl')=>league==='nfl'?
 {eventID,playerID:String(100+i),name:'Athlete '+i,team:'JAX',cat:['passing','rushing','receiving','td','receptions'][i%5],analyticsThreshold:([180,65,60,0,3][i%5])||'Anytime TD'}:
 {gameId:eventID,playerId:String(100+i),name:'Athlete '+i,team:'LAL',category:['points','rebounds','assists','threes','pra'][i%5],threshold:20};
const market=(leg,offered,book='FanDuel')=>({...leg,sideID:'over',
 books:[{book,available:true,line:offered,odds:-110}]});
const nflCard=(risk,id)=>{
 const count=risk==='Small'?4:risk==='Medium'?5:6;
 const legs=Array.from({length:count},(_,i)=>makeLeg(id,i));
 if(count===6)legs[5]={...makeLeg(id,5),playerID:'105',cat:'receiving',analyticsThreshold:40};
 return{risk,legs,requiredLegs:count,tierAssessment:{compositionOk:true}};
};
const nbaCard=(risk,id)=>{
 const count=risk==='Small'?3:risk==='Medium'?5:6;
 return{risk,status:'MODEL_CANDIDATE',legs:Array.from({length:count},(_,i)=>makeLeg(id,i,'nba')),requiredLegs:count};
};
test('photo: 5-leg Medium +975 with 3 mismatches never attests a Medium +3000 ticket',()=>{
 const id='401999999',s=nflCard('Medium',id);
 s.legs=[
  {eventID:id,playerID:'1',name:'Bhayshul Tuten',team:'JAX',cat:'rushing',analyticsThreshold:65},
  {eventID:id,playerID:'2',name:'Trevor Lawrence',team:'JAX',cat:'passing',analyticsThreshold:180},
  {eventID:id,playerID:'3',name:'Parker Washington',team:'JAX',cat:'receiving',analyticsThreshold:60},
  {eventID:id,playerID:'4',name:'Chris Rodriguez Jr.',team:'JAX',cat:'rushing',analyticsThreshold:20},
  {eventID:id,playerID:'5',name:'Brenton Strange',team:'JAX',cat:'receiving',analyticsThreshold:30}
 ];
 const offers=[
  market(s.legs[0],65.5),market(s.legs[1],'175+'),
  market(s.legs[2],'60+'),market(s.legs[3],'20+'),
  market(s.legs[4],33.5)
 ];
 s.bookMarketAudits={FanDuel:auditNflBookSgpMarkets({sgp:s,book:'FanDuel',gameId:id,markets:offers})};
 const a=auditLeagueSgpEvent({league:'nfl',gameId:id,sgps:{Analytics:[s]}});
 const m=a.tiers.find(x=>x.risk==='Medium');
 assert.equal(s.bookMarketAudits.FanDuel.matchedLegs,2);
 assert.deepEqual(s.bookMarketAudits.FanDuel.missingLegs.map(x=>x.name),
  ['Bhayshul Tuten','Trevor Lawrence','Brenton Strange']);
 assert.equal(m.books.FanDuel.status,'BOOK_LEG_MISMATCH');
 assert.equal(m.books.FanDuel.matchedLegs,2);
 assert.equal(m.combinedOddsVerified,false);
 assert.equal(m.actualCombinedOdds,null);
 assert.deepEqual(m.targetOdds,LEAGUE_SGP_TARGETS.Medium);
 assert.ok(975<LEAGUE_SGP_TARGETS.Medium.minimum);
});
test('all NFL matchups: 13 games * 3 tiers * 2 books, no unverified quote becomes ready',()=>{
 const gameIDs=Array.from({length:13},(_,i)=>String(401800000+i));
 for(const id of gameIDs){
  const sgps={Analytics:LEAGUE_SGP_TIERS.map(risk=>nflCard(risk,id))};
  const audit=auditLeagueSgpEvent({league:'nfl',gameId:id,sgps});
  assert.deepEqual(audit.tiers.map(x=>x.risk),['Small','Medium','Nuke']);
  assert.equal(audit.modelReadyCount,3);
  assert.equal(audit.sportsbookVerifiedCount,0);
  for(const tier of audit.tiers){
   assert.equal(Object.keys(tier.books).length,2);
   for(const book of Object.values(tier.books))
    assert.equal(book.status,'NO_VERIFIED_BOOK_MARKETS');
  }
 }
});
test('all NBA matchups use the same 3-tier quote fail-closed contract, even with models',()=>{
 for(let i=0;i<15;i++){
  const id=String(401900000+i),sgps=LEAGUE_SGP_TIERS.map(risk=>nbaCard(risk,id));
  const a=auditLeagueSgpEvent({league:'nba',gameId:id,sgps});
  assert.equal(a.tiers.length,3);
  assert.equal(a.modelReadyCount,3);
  assert.equal(a.allThreeBookmakerVerified,false);
  assert.ok(a.tiers.every(t=>t.combinedOddsVerified===false&&t.sportsbookStatus==='SPORTSBOOK_VERIFICATION_PENDING'));
 }
});
test('a mislabeled event, duplicated player, or missing tier is NOT READY',()=>{
 const id='401800005',wrong='401800006';
 const small=nflCard('Small',id);
 let bad={...small,legs:small.legs.map((x,i)=>i===0?{...x,eventID:wrong}:x)};
 assert.equal(auditLeagueSgpEvent({league:'nfl',gameId:id,sgps:{Analytics:[bad]}}).tiers[0].modelStatus,'NOT_READY');
 bad={...small,legs:[small.legs[0],small.legs[0],...small.legs.slice(2)]};
 assert.equal(auditLeagueSgpEvent({league:'nfl',gameId:id,sgps:{Analytics:[bad]}}).tiers[0].modelStatus,'NOT_READY');
 const r=auditLeagueSgpEvent({league:'nfl',gameId:id,sgps:{Analytics:[small]}});
 assert.deepEqual(r.tiers.slice(1).map(x=>x.modelStatus),['NOT_READY','NOT_READY']);
});
test('both sharded collectors expose per-matchup bookmaker audit without claiming a ticket',()=>{
 const ids=Array.from({length:13},(_,i)=>String(401800000+i));
 const reports=ids.map(id=>({gameId:id,status:'updated',
  modelTierReadiness:Object.fromEntries(LEAGUE_SGP_TIERS.map(r=>[r,{status:'MODEL_CANDIDATE'}])),
  sgpVerification:auditLeagueSgpEvent({league:'nfl',gameId:id,
   sgps:{Analytics:LEAGUE_SGP_TIERS.map(risk=>nflCard(risk,id))}})}));
 const shard0=collectorAuditReport('nfl',0,reports.filter((_,i)=>i%2===0));
 const shard1=collectorAuditReport('nfl',1,reports.filter((_,i)=>i%2!==0));
 assert.equal(shard0.attempted+shard1.attempted,13);
 for(const r of [...shard0.results,...shard1.results]){
  assert.equal(r.sportsbookTierAudit.length,3);
  assert.equal(r.bookmakerVerifiedCount,0);
  assert.ok(r.sportsbookTierAudit.every(x=>x.books.FanDuel.status==='NO_VERIFIED_BOOK_MARKETS'));
 }
});
test('production schedulers, NFL view and NBA game expose shared audit on every game',()=>{
 for(const [path,piece] of [
  ['api/nfl-markets.js','sgpVerification:gameId?auditLeagueSgpEvent'],
  ['api/nfl-health.js','sgpVerification:m.sgpVerification||null'],
  ['api/nba-health.js',"result.sgpVerification=auditLeagueSgpEvent({league:'nba'"],
  ['api/nba-game.js','data.sgpVerification=snapshot.sgpVerification||null'],
  ['lib/pregame-collector-shards.js','sportsbookTierAudit:']
 ]){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.ok(src.includes(piece),path);
 }
});
