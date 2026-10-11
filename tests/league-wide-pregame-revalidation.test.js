import test from 'node:test';
import assert from 'node:assert/strict';
import {pregamePhase,pregameEvidenceAudit,pregameNeedsAiReview,
 PREGAME_LEAGUES,PREGAME_PHASES} from '../lib/pregame-revalidation.js';
import {nbaPregameStage,nbaCollectPregame,NBA_PREGAME_MODEL_VERSION} from '../api/nba-health.js';
import {nbaOffenseDefenseEvidence,nbaBuildPregameModels} from '../lib/nba-pregame-model.js';
import {historySnap} from '../api/nfl-health.js';

const kickoff=Date.parse('2026-10-20T23:00:00Z');
const game={gameId:'401911111',status:'SCHEDULED',
 kickoff:new Date(kickoff).toISOString(),
 home:{abbr:'BOS',id:'2'},away:{abbr:'MIA',id:'16'}};
test('all registered leagues use the same day-before, T-90 and T-30 phases',()=>{
 assert.deepEqual(PREGAME_LEAGUES,['nfl','nba']);
 const at=minutes=>pregamePhase(game,{now:kickoff-minutes*60_000});
 assert.equal(at(36*60).stage,'DAY_AHEAD_BUILD');
 assert.equal(at(36*60+1).due,false);
 assert.equal(at(24*60).stage,'DAY_AHEAD_BUILD');
 assert.equal(at(90).stage,'PREGAME_VALIDATION');
 assert.equal(at(30).stage,'FINAL_T_MINUS_30');
 assert.equal(at(15).stage,'FINAL_T_MINUS_30');
 assert.equal(at(0).due,false);
 assert.equal(PREGAME_PHASES.FINAL_T_MINUS_30.maxSnapshotAgeMinutes,10);
 assert.equal(at(25).maxSnapshotAgeMinutes,10);
});
test('NBA schedule refreshes at most hourly day-ahead, every 15m near tipoff, 10m final',()=>{
 for(const [remaining,ttl] of [[1440,60],[80,15],[29,10]]){
  const now=kickoff-remaining*60_000,plan=nbaPregameStage(game,null,{now});
  assert.equal(plan.due,true);
  const recent={modelVersion:NBA_PREGAME_MODEL_VERSION,stage:plan.stage,
   checkedAt:new Date(now-(ttl-1)*60_000).toISOString()};
  const due={...recent,checkedAt:new Date(now-ttl*60_000).toISOString()};
  assert.equal(nbaPregameStage(game,recent,{now}).due,false);
  assert.equal(nbaPregameStage(game,due,{now}).due,true);
 }
});
test('NFL detects anytime TD, passing, rushing, receiving, receptions and matchup changes, not only SGP legs',()=>{
 const picks=['td','passing','rushing','receiving','receptions'].map((category,i)=>({
  playerId:String(9000+i),team:'PHI',category,threshold:category==='td'?1:50+i*5,
  projection:category==='td'?1:75+i*5}));
 const raw={gameId:'401872981',home:{abbr:'JAX'},away:{abbr:'PHI'},
  picks,sgps:[{risk:'Small',legs:[{playerID:'9000',cat:'td',threshold:1}]}],
  injuryEvidence:[],matchupEvidence:{offense:65,defense:47},modelVersion:'v4'};
 const first=pregameEvidenceAudit(null,raw,{league:'nfl'});
 const saved={...raw,evidenceDigests:first.evidenceDigests};
 const same=pregameEvidenceAudit(saved,{...raw},{league:'nfl'});
 assert.deepEqual(same.changedFields,[]);
 for(const category of ['td','passing','rushing','receiving','receptions']){
  const updated={...raw,picks:picks.map(p=>p.category===category?{
   ...p,projection:p.projection+8}:p)};
  const changes=pregameEvidenceAudit(saved,updated,{league:'nfl'});
  assert.ok(changes.changedFields.includes('PLAYER_PROPS'),category);
  assert.equal(changes.changedFromPrior,true);
 }
 assert.ok(pregameEvidenceAudit(saved,{...raw,
  injuryEvidence:[{playerId:'9002',name:'Runner',team:'PHI',status:'OUT'}]
 },{league:'nfl'}).changedFields.includes('INJURIES'));
 assert.ok(pregameEvidenceAudit(saved,{...raw,
  matchupEvidence:{offense:65,defense:33}},
  {league:'nfl'}).changedFields.includes('MATCHUP'));
 assert.ok(pregameEvidenceAudit(saved,{...raw,
  sgps:[{risk:'Small',legs:[]}]},{league:'nfl'}).changedFields.includes('SGP_TIERS'));
 assert.throws(()=>pregameEvidenceAudit(saved,raw,{league:'mlb'}),/adapter_not_registered/,
  'future sports must not appear implemented without verified adapters');
});
test('fresh fetch timestamps do not count as new injuries or defense-vs-position readings',()=>{
 const nba={gameId:game.gameId,home:game.home,away:game.away,
  injuryReportStatus:'ESPN_REPORTED_INJURIES_RECHECKED',
  verifiedInjuries:[{name:'Player One',team:'BOS',status:'OUT'}],
  playerProjections:[{playerId:'101',team:'BOS',category:'points',projection:21}],
  sgps:[],offenseDefense:{status:'HISTORICAL_MODEL_ONLY',
   checkedAt:'2026-10-20T20:00:00Z',byTeam:{BOS:{factor:1.02}}}};
 const old=pregameEvidenceAudit(null,nba,{league:'nba'});
 const x=pregameEvidenceAudit({...nba,evidenceDigests:old.evidenceDigests},
  {...nba,offenseDefense:{...nba.offenseDefense,checkedAt:'2026-10-20T21:00:00Z'}},
  {league:'nba'});
 assert.deepEqual(x.changedFields,[]);
 const y=pregameEvidenceAudit({...nba,evidenceDigests:old.evidenceDigests},
  {...nba,verifiedInjuries:[{name:'Player One',team:'BOS',status:'QUESTIONABLE'}]},
  {league:'nba'});
 assert.ok(y.changedFields.includes('INJURIES'));
 const z=pregameEvidenceAudit({...nba,evidenceDigests:old.evidenceDigests},
  {...nba,offenseDefense:{...nba.offenseDefense,byTeam:{BOS:{factor:0.98}}}},
  {league:'nba'});
 assert.ok(z.changedFields.includes('MATCHUP'));
 assert.equal(pregameNeedsAiReview({stage:'DAY_AHEAD_BUILD',changedFields:['INJURIES']}),false);
 assert.equal(pregameNeedsAiReview({stage:'FINAL_T_MINUS_30',changedFields:['INJURIES'],priorAiReviewed:true}),true);
 assert.equal(pregameNeedsAiReview({stage:'FINAL_T_MINUS_30',changedFields:[],priorAiReviewed:true}),false);
});
const historical=[
 ...[1,2,3].map(i=>({gameId:String(400000001+i),status:'FINAL',
  matchup:{home:{abbr:'BOS'},away:{abbr:'NYK'}},
  players:[...Array.from({length:7},(_,j)=>({playerId:String(100+j),team:'BOS',points:12+j+i})),
   ...Array.from({length:7},(_,j)=>({playerId:String(300+j),team:'NYK',points:13+j+i}))]})),
 ...[1,2,3].map(i=>({gameId:String(400000011+i),status:'FINAL',
  matchup:{home:{abbr:'MIA'},away:{abbr:'CHI'}},
  players:[...Array.from({length:7},(_,j)=>({playerId:String(200+j),team:'MIA',points:9+j+i})),
   ...Array.from({length:7},(_,j)=>({playerId:String(400+j),team:'CHI',points:17+j+i}))]}))
];
test('NBA offense-vs-defense uses verified completed box scores with bounded, labeled adjustments',()=>{
 const e=nbaOffenseDefenseEvidence(historical,'BOS','MIA');
 assert.equal(e.status,'HISTORICAL_MODEL_ONLY');
 assert.ok(e.byTeam.BOS.factor>=.94&&e.byTeam.BOS.factor<=1.06);
 assert.ok(e.byTeam.MIA.factor>=.94&&e.byTeam.MIA.factor<=1.06);
 assert.notEqual(e.byTeam.BOS.factor,e.byTeam.MIA.factor);
 assert.equal(e.byTeam.BOS.games,3);
 assert.equal(e.byTeam.BOS.opponentDefenseGames,3);
 assert.match(e.disclaimer,/\+\/-6%/);
 const insufficient=nbaOffenseDefenseEvidence(historical.slice(0,1),'BOS','MIA');
 assert.equal(insufficient.status,'INSUFFICIENT_SAMPLES');
 assert.equal(insufficient.byTeam.BOS.factor,1);
 assert.equal(insufficient.byTeam.MIA.factor,1);
});
test('NBA projection and thresholds incorporate the verified defense factor; no fabricated book odds',()=>{
 const h=historical.map(x=>({...x,players:x.players.map(p=>({
  ...p,rebounds:5,assists:4,threes:2,pra:p.points+9}))}));
 const roster=new Map([...Array.from({length:7},(_,j)=>[String(100+j),{
  id:String(100+j),name:'Boston Player '+j,team:'BOS',active:true}]),
  ...Array.from({length:7},(_,j)=>[String(200+j),{
   id:String(200+j),name:'Miami Player '+j,team:'MIA',active:true}])]);
 const e=nbaOffenseDefenseEvidence(h,'BOS','MIA');
 const model=nbaBuildPregameModels({gameId:game.gameId,home:'BOS',away:'MIA',
  tipoff:game.kickoff,historical:h,roster,offenseDefense:e});
 assert.equal(model.offenseDefense.status,'HISTORICAL_MODEL_ONLY');
 assert.ok(model.playerProjections.length);
 for(const p of model.playerProjections){
  const factor=e.byTeam[p.team].factor;
  assert.equal(p.matchupAdjustment.factor,factor);
  assert.ok(Math.abs(p.projection-p.baseProjection*factor)<.11);
 }
 assert.equal(model.sportsbookMarketsVerified,false);
 assert.ok(model.sgps.every(s=>s.combinedBookOddsVerified===false));
});
test('NBA automated injury revalidation changes projections, both prop/SGP and reviewer state',async()=>{
 const now=kickoff-25*60000,previous=null,saved=[];
 const summary={header:{competitions:[{id:game.gameId,competitors:[
  {team:{abbreviation:'BOS'}},{team:{abbreviation:'MIA'}}]}]},
  injuries:[{team:{abbreviation:'BOS'},injuries:[
   {athlete:{displayName:'Player One'},status:'OUT'}]}]};
 const prepare=async ({injuries})=>({status:'MODEL_ONLY',
  playerProjections:[{playerId:'101',team:'MIA',category:'points',projection:20}],
  sgps:[{risk:'Small',status:'MODEL_CANDIDATE',legs:[
   {playerId:'101',team:'MIA',category:'points',threshold:15}]}],
  offenseDefense:{status:'INSUFFICIENT_SAMPLES',byTeam:{MIA:{factor:1}}},
  reason:'Historical model'});
 const result=await nbaCollectPregame(game,{now,prior:previous,
  fetchJson:async()=>summary,prepare,write:async data=>saved.push(data),
  review:async()=>({status:'REVIEWED'})});
 assert.equal(result.stage,'FINAL_T_MINUS_30');
 assert.equal(result.modelTiers.length,1);
 assert.equal(saved[0].injuryReportStatus,'ESPN_REPORTED_INJURIES_RECHECKED');
 assert.ok(saved[0].changedFields.includes('FIRST_SNAPSHOT'));
 assert.equal(saved[0].aiReviewed,true);
 assert.equal(saved[0].evidenceDigests.MATCHUP.length,20);
});
test('NFL history captures matchup, injury status and every prop type for followup changes',()=>{
 const g={gameId:'401872981',kickoff:new Date(Date.now()+24*3600000).toISOString(),
  home:{abbr:'JAX'},away:{abbr:'PHI'}};
 const cats=Object.fromEntries(['td','passing','rushing','receiving','receptions']
  .map((x,i)=>[x,[{playerId:String(100+i),team:'JAX',
   analyticsThreshold:x==='td'?1:50+i*5,projection:55+i*5}]]));
 const m={categories:cats,sgps:{Analytics:[]},validation:{injuryEligibilityChecked:true,
  blockedPlayerCount:2,injuryEvidence:[{playerId:'100',name:'A',team:'JAX',status:'OUT'}]},
  outcomePrediction:{edge:{defense:1.2}}};
 const snap=historySnap(g,m);
 assert.equal(snap.picks.length,5);
 assert.equal(snap.injuryEvidence[0].status,'OUT');
 assert.equal(snap.offenseDefense.edge.defense,1.2);
 assert.deepEqual(snap.propCategories,['td','passing','rushing','receiving','receptions']);
});
