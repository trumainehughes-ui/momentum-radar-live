import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nbaPregameFreshness,nbaPregameStatus,nbaCollectPregame,NBA_PREGAME_MODEL_VERSION}
 from '../api/nba-health.js';
const tip=Date.parse('2026-10-20T23:00:00Z');
const game={gameId:'401911111',status:'SCHEDULED',kickoff:new Date(tip).toISOString(),
 home:{id:'2',abbr:'BOS'},away:{id:'16',abbr:'MIA'}};
const sample=(stage,checked,revision=1)=>({
 gameId:game.gameId,kickoff:game.kickoff,stage,
 modelVersion:NBA_PREGAME_MODEL_VERSION,
 checkedAt:new Date(checked).toISOString(),revision,
 sgps:[{risk:'Small',status:'MODEL_CANDIDATE',
  legs:[{playerId:'123',name:'An eligible sampled player',team:'BOS',
   category:'points',threshold:20}],combinedBookOdds:null}]
});
test('day-ahead snapshot is current within eight hours and expires thereafter',()=>{
 const now=tip-25*60*60*1000;
 const recent=sample('DAY_AHEAD_BUILD',now-7*60*60*1000);
 const aged=sample('DAY_AHEAD_BUILD',now-9*60*60*1000);
 assert.equal(nbaPregameFreshness(recent,{now}).status,'CURRENT');
 assert.equal(nbaPregameStatus(recent,{now}).status,'MODEL_ONLY');
 assert.deepEqual(nbaPregameStatus(recent,{now}).tiers,['Small']);
 assert.equal(nbaPregameFreshness(aged,{now}).status,'STALE');
 assert.equal(nbaPregameStatus(aged,{now}).tiers.length,0,
  'Expired historical candidates cannot be displayed as current');
});
test('within final 30m all earlier stages require a fresh T-30 build',()=>{
 const now=tip-25*60*1000;
 for(const stage of ['DAY_AHEAD_BUILD','PREGAME_VALIDATION']){
  const old=sample(stage,now-15*60*1000);
  assert.equal(nbaPregameFreshness(old,{now}).status,'STALE');
  const state=nbaPregameStatus(old,{now});
  assert.equal(state.status,'STALE');
  assert.equal(state.aiReviewStatus,'STALE');
  assert.deepEqual(state.tiers,[]);
 }
 const current=sample('FINAL_T_MINUS_30',now-12*60*1000);
 assert.equal(nbaPregameStatus(current,{now}).status,'MODEL_ONLY');
 assert.equal(nbaPregameStatus(sample('FINAL_T_MINUS_30',now-21*60*1000),{now}).status,'STALE');
});
test('T-90 validation must not silently reuse previous day SGP',()=>{
 const now=tip-65*60*1000;
 const yesterday=sample('DAY_AHEAD_BUILD',now-2*60*60*1000);
 assert.equal(nbaPregameFreshness(yesterday,{now}).status,'STALE');
 assert.match(nbaPregameStatus(yesterday,{now}).reason,/validation/i);
 const validation=sample('PREGAME_VALIDATION',now-45*60*1000);
 assert.equal(nbaPregameFreshness(validation,{now}).status,'CURRENT');
 assert.equal(nbaPregameFreshness(sample('PREGAME_VALIDATION',now-65*60*1000),{now}).status,'STALE');
});
test('old model, future timestamps and after tipoff never yield a current pregame pick',()=>{
 const now=tip-20*60*1000;
 const x=sample('FINAL_T_MINUS_30',now-2*60*1000);
 assert.equal(nbaPregameStatus({...x,modelVersion:'v3-preseason-and-prior-season-baseline'},{now}).status,'STALE');
 assert.equal(nbaPregameFreshness({...x,checkedAt:new Date(now+4000).toISOString()},{now}).status,'STALE');
 assert.equal(nbaPregameStatus(x,{now:tip+60*1000}).status,'STALE');
 assert.equal(nbaPregameStatus(x,{now,gameStatus:'LIVE'}).status,'CLOSED');
 assert.equal(nbaPregameStatus(null,{now}).status,'PENDING');
});
test('NBA summary without an injury section does not falsely claim a completed injury report',async()=>{
 const checked=[],snapshot=[];
 const now=tip-25*60*60*1000;
 const gameSummary={header:{competitions:[{id:game.gameId,competitors:[
   {team:{abbreviation:'BOS'}},{team:{abbreviation:'MIA'}}]}]}};
 const p=await nbaCollectPregame(game,{
  now,
  fetchJson:async()=>gameSummary,
  prepare:async()=>({status:'NOT_READY',sgps:[],reason:'No completed games'}),
  write:async s=>snapshot.push(s),
  review:async()=>{throw Error('AI should not be invoked')}
 });
 assert.equal(p.stage,'DAY_AHEAD_BUILD');
 assert.equal(snapshot[0].injuryCheckedAt,null);
 assert.equal(snapshot[0].injuryReportStatus,'ESPN_SUMMARY_WITHOUT_INJURY_SECTION');
 assert.match(snapshot[0].injuryLimitations,/UNVERIFIED/);
 assert.equal(snapshot[0].verifiedInjuries.length,0);
 assert.equal(snapshot[0].aiReviewed,false);
});
test('NBA JSON with an explicit empty injury-report section records a source check, not official inactives',async()=>{
 const saved=[];
 const now=tip-25*60*60*1000;
 const summary={header:{competitions:[{id:game.gameId,competitors:[
  {team:{abbreviation:'BOS'}},{team:{abbreviation:'MIA'}}]}]},injuries:[]};
 await nbaCollectPregame(game,{now,
  fetchJson:async()=>summary,
  prepare:async()=>({status:'NOT_READY',sgps:[],reason:'No completed games'}),
  write:async x=>saved.push(x)});
 assert.equal(saved[0].injuryReportStatus,'ESPN_REPORTED_INJURIES_RECHECKED');
 assert.ok(saved[0].injuryCheckedAt);
 assert.equal(saved[0].injuryChecks?.officialInactivesVerified??false,false);
});
test('game API and UI never show old candidate legs as ready current NBA SGPs',()=>{
 const gameSrc=readFileSync(new URL('../api/nba-game.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.ok(gameSrc.includes("data.pregameReadiness.freshness==='CURRENT'"));
 assert.ok(gameSrc.includes('nbaNotReadyTiers(data.pregameReadiness.reason)'));
 assert.ok(ui.includes('STALE NBA MODEL'));
 assert.ok(ui.includes('injuryReportStatus'));
 assert.ok(ui.includes('NOT sportsbook offers')||ui.includes('NOT VERIFIED'));
});

test('injury-driven invalidation clears old AI-reviewed status and never preserves old parlay legs',async()=>{
 const now=tip-15*60*1000,persisted=[];
 const previous={...sample('FINAL_T_MINUS_30',now-12*60*1000),
  status:'MODEL_ONLY',aiReviewed:true,aiReview:{status:'REVIEWED',provider:'groq'},
  checkedAt:new Date(now-12*60*1000).toISOString()};
 const espn={header:{competitions:[{id:game.gameId,competitors:[
  {team:{abbreviation:'BOS'}},{team:{abbreviation:'MIA'}}]}]},
  injuries:[{team:{abbreviation:'BOS'},injuries:[{
   athlete:{displayName:'Unavailable Player'},status:'Out'}]}]};
 const outcome=await nbaCollectPregame(game,{now,prior:previous,
  fetchJson:async()=>espn,
  prepare:async()=>({status:'NOT_READY',sgps:[],playerProjections:[],
   reason:'All model legs invalidated following player injury check'}),
  write:async x=>persisted.push(x),
  review:async()=>{throw Error('AI must not bless empty tiers')}
 });
 assert.equal(outcome.status,'NOT_READY');
 assert.equal(persisted[0].priorCandidateInvalidated,true);
 assert.equal(persisted[0].aiReviewed,false);
 assert.equal(persisted[0].aiReview.status,'SKIPPED');
 assert.deepEqual(persisted[0].sgps,[]);
 assert.equal(nbaPregameStatus(persisted[0],{now}).status,'NOT_READY');
});
