import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nbaBuildCoverage,nbaCoverageIdentity,nbaCoverageResult,NBA_COVERAGE_MAX_GAMES}
 from '../lib/nba-slate-coverage.js';
import {NBA_PREGAME_MODEL_VERSION} from '../api/nba-health.js';
import coverageHandler from '../api/nba-coverage.js';
const tip=Date.parse('2026-10-20T23:00:00Z'),id='401911111';
const game={gameId:id,status:'SCHEDULED',kickoff:new Date(tip).toISOString(),
 home:{abbr:'BOS',id:'2'},away:{abbr:'MIA',id:'16'}};
const snapshot=(checked,stage='DAY_AHEAD_BUILD')=>({
 gameId:id,kickoff:game.kickoff,home:game.home,away:game.away,
 checkedAt:new Date(checked).toISOString(),stage,modelVersion:NBA_PREGAME_MODEL_VERSION,
 status:'MODEL_ONLY',injuryReportStatus:'ESPN_REPORTED_INJURIES_RECHECKED',
 injuryCheckedAt:new Date(checked).toISOString(),
 aiReview:{status:'PENDING'},sampleSource:'PRIOR_SEASON',historicalSeason:2026,
 sgps:[{risk:'Small',status:'MODEL_CANDIDATE',legs:[{playerId:'123',category:'points',threshold:20}]},
  {risk:'Medium',status:'MODEL_CANDIDATE',legs:[{playerId:'124',category:'assists',threshold:6}]}]
});
test('game identity must match ESPN game ID, both teams and tipoff within 60 seconds',()=>{
 const v=snapshot(tip-25*3600000);
 assert.equal(nbaCoverageIdentity(game,v),true);
 assert.equal(nbaCoverageIdentity(game,{...v,gameId:'401911112'}),false);
 assert.equal(nbaCoverageIdentity(game,{...v,home:{abbr:'CHI'}}),false);
 assert.equal(nbaCoverageIdentity(game,{...v,away:{abbr:'LAL'}}),false);
 assert.equal(nbaCoverageIdentity(game,{...v,kickoff:new Date(tip+61000).toISOString()}),false);
});
test('day-ahead saved model coverage is model-only and never represents sportsbook verification',()=>{
 const now=tip-24*3600000;
 const v=nbaCoverageResult(game,snapshot(now-3600000),{now});
 assert.equal(v.status,'MODEL_ONLY');
 assert.equal(v.tierCount,2);
 assert.deepEqual(v.tiers,['Small','Medium']);
 assert.equal(v.sampleSource,'PRIOR_SEASON');
 assert.equal(v.sportsbookOddsVerified,false);
 assert.equal(v.injuryReportStatus,'ESPN_REPORTED_INJURIES_RECHECKED');
 assert.ok(!('legs' in v),'public coverage cannot leak stored model selections');
});
test('30-minute check never counts yesterday model or previous AI review as current',()=>{
 const now=tip-25*60000,v=nbaCoverageResult(game,
  {...snapshot(now-20*60000),aiReview:{status:'REVIEWED'}},{now});
 assert.equal(v.status,'STALE');
 assert.equal(v.tierCount,0);
 assert.equal(v.aiReviewStatus,'STALE');
 assert.equal(v.sportsbookOddsVerified,false);
});
test('not-yet-eligible date, game over, and missing snapshots are distinct—not fabricated odds or predictions',()=>{
 const early=nbaCoverageResult(game,null,{now:tip-48*3600000});
 assert.equal(early.status,'WINDOW_NOT_STARTED');
 assert.equal(nbaCoverageResult(game,null,{now:tip-24*3600000}).status,'PENDING');
 assert.equal(nbaCoverageResult({...game,status:'FINAL'},snapshot(tip-25*3600000),
  {now:tip-24*3600000}).status,'CLOSED');
 assert.equal(nbaCoverageResult(game,null,{now:tip+60000}).status,'AWAITING_GAME_STATUS');
 assert.equal(nbaCoverageResult(game,{...snapshot(tip-25*3600000),home:{abbr:'NYK'}},
  {now:tip-24*3600000}).status,'IDENTITY_MISMATCH');
});
test('read-only coverage scans at most 18 upcoming games with bounded storage attempts',async()=>{
 const now=tip-24*3600000,calls=[];
 const games=Array.from({length:25},(_,i)=>({
  ...game,gameId:String(401911111+i)
 }));
 const data=await nbaBuildCoverage(games,{now,read:async id=>{
  calls.push(id);
  if(id===String(Number(game.gameId)+1))throw Error('cannot access blob');
  if(id!==game.gameId)return null;
  return snapshot(now-3600000);
 }});
 assert.equal(data.summary.checked,NBA_COVERAGE_MAX_GAMES);
 assert.equal(calls.length,NBA_COVERAGE_MAX_GAMES);
 assert.equal(data.summary.modelCandidates,1);
 assert.equal(data.summary.pending,16);
 assert.equal(data.summary.sourceErrors,1);
 assert.equal(data.games[1].status,'SNAPSHOT_UNAVAILABLE');
 assert.equal(data.summary.currentBookQuoted,0);
 assert.ok(data.games.every(x=>!('legs' in x)));
});
test('outside the upcoming window there are no Blob list/download calls',async()=>{
 let calls=0;
 const report=await nbaBuildCoverage([game],{
  now:tip-10*24*3600000,read:async()=>{calls++;throw Error('never reach storage')}});
 assert.equal(calls,0);
 assert.equal(report.games[0].status,'WINDOW_NOT_STARTED');
});
test('NBA coverage endpoint validates date and uses only ESPN scoreboard and saved Blob (never betting/AI)',async()=>{
 const response=()=>({code:200,setHeader(){return this},status(x){this.code=x;return this},
  json(x){this.body=x;return this}});
 const bad=response();await coverageHandler({method:'GET',query:{date:'2026-13-50'}},bad);
 assert.equal(bad.code,400);
 const badMethod=response();await coverageHandler({method:'POST',query:{}},badMethod);
 assert.equal(badMethod.code,405);
 // Use a relative future date to avoid relying on a fixed CI runtime date.
 const future=new Date(Date.now()+10*24*3600000),date=future.toISOString().slice(0,10);
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{
  calls.push(String(url));
  return{ok:true,json:async()=>({events:[{
   id,season:{type:2},date:future.toISOString(),status:{type:{state:'pre'}},
   competitions:[{id,status:{type:{state:'pre'}},competitors:[
    {homeAway:'home',team:{id:'2',abbreviation:'BOS',displayName:'Boston Celtics'}},
    {homeAway:'away',team:{id:'16',abbreviation:'MIA',displayName:'Miami Heat'}}
   ]}]
  }]})};
 };
 try{
  const out=response();
  await coverageHandler({method:'GET',query:{date}},out);
  assert.equal(out.code,200);
  assert.equal(out.body.ok,true);
  assert.equal(out.body.mode,'READ_ONLY');
  assert.equal(out.body.summary.outsideWindow,1);
  assert.ok(calls.length===1&&calls[0].includes('scoreboard'));
  assert.ok(!JSON.stringify(out.body).includes('sportsbookOddsVerified":true'));
 }finally{globalThis.fetch=original}
 const ui=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.ok(ui.includes('/api/nba-coverage?date='));
 assert.ok(ui.includes('SGP model refresh pending'));
 assert.ok(ui.includes('MODEL ONLY'));
 const api=readFileSync(new URL('../api/nba-coverage.js',import.meta.url),'utf8');
 assert.ok(!/GROQ_API_KEY|BALLDONTLIE_API_KEY|SPORTSGAMEODDS_API_KEY|THE_ODDS_API_KEY/.test(api));
});
