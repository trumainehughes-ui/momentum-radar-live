import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 nbaCompletedTeamGames,nbaRosterEvidence,nbaBuildPregameModels,nbaPrepareEvidence
} from '../lib/nba-pregame-model.js';
import {nbaPregameStage,nbaPregameStatus,nbaCollectPregame} from '../api/nba-health.js';
import nbaCollector from '../api/nba-health.js';
import {pregameAiEvidence,pregameAiAudit} from '../lib/pregame-ai-review.js';
import {historySnap} from '../api/nfl-health.js';

const game={
 gameId:'401810101',home:{id:'2',abbr:'BOS'},away:{id:'16',abbr:'MIA'},
 kickoff:'2026-10-11T23:00:00.000Z',status:'SCHEDULED'
};
const past=(i,team)=>({
 gameId:String(401800100+i),status:'FINAL',
 players:Array.from({length:6},(_,j)=>({
  playerId:String((team==='BOS'?2000:3000)+j),name:team+' '+j,team,
  points:14+j*3+i,rebounds:4+j+i,assists:2+j+i,threes:1+(j%3)+i,pra:20+5*j+3*i
 }))
});
const rosters=[...['BOS','MIA'].map(team=>({
 team,data:{athletes:Array.from({length:6},(_,j)=>({
  id:String((team==='BOS'?2000:3000)+j),displayName:team+' '+j,status:{name:'Active'}
 })) }
}))];
const roster=nbaRosterEvidence(rosters,'BOS','MIA');
const history=[1,2,3].flatMap(i=>[past(i,'BOS'),past(i+3,'MIA')]);
const build=(injuries=[])=>nbaBuildPregameModels({gameId:game.gameId,home:'BOS',away:'MIA',
 tipoff:game.kickoff,roster,historical:history,injuries});
test('actual past NBA team schedules select only FINAL events strictly before tipoff',()=>{
 const data={events:[{id:'401810002',date:'2026-10-08T00:00:00Z',
  status:{type:{state:'post'}}},{id:'401810003',date:game.kickoff,status:{type:{state:'pre'}}},
  {id:'401810004',date:'2026-10-10T00:00:00Z',status:{type:{state:'post'}}}]};
 assert.deepEqual(nbaCompletedTeamGames(data,game.kickoff),['401810004','401810002']);
 assert.deepEqual(nbaCompletedTeamGames({},game.kickoff),[]);
});
test('NBA model constructs distinct-player, mixed-category day-before tiers from real samples',()=>{
 const result=build();
 assert.equal(result.status,'MODEL_ONLY');
 assert.ok(result.samplesUsed>=2);
 assert.ok(result.playerProjections.length>8);
 for(const [risk,min,mix] of [['Small',2,2],['Medium',3,2],['Nuke',5,3]]){
  const row=result.sgps.find(x=>x.risk===risk);
  assert.ok(['MODEL_CANDIDATE','NOT_READY'].includes(row.status),risk);
  if(risk==='Nuke')assert.equal(row.status,'NOT_READY','unquoted Nuke must not be modeled as playable');
  if(row.status==='NOT_READY')continue;
  assert.ok(row.legs.length>=min,risk);
  assert.ok(new Set(row.legs.map(x=>x.playerId)).size===row.legs.length);
  assert.ok(new Set(row.legs.map(x=>x.category)).size>=mix);
  assert.ok(row.legs.every(l=>l.gameId===game.gameId&&l.sampleGames>=2));
  assert.ok(row.legs.every(l=>['BOS','MIA'].includes(l.team)));
  assert.equal(row.publishable,false);
  assert.equal(row.combinedBookOdds,null);
  assert.equal(row.combinedBookOddsVerified,false);
  if(risk==='Nuke')assert.ok(row.legs.every(l=>l.threshold>l.projection));
 }
});
test('ineligible reported NBA players are removed and model recomputes automatically',()=>{
 const baseline=build(),blocked=baseline.playerProjections[0];
 assert.ok(blocked,'fixture must include historical player projections');
 const altered=build([{name:blocked.name,team:blocked.team,status:'OUT'}]);
 assert.ok(!altered.playerProjections.some(p=>p.playerId===blocked.playerId));
 for(const row of altered.sgps)assert.ok(!row.legs.some(p=>p.playerId===blocked.playerId));
 const mixed=build([{name:'BOS 2',team:'BOS',status:'Questionable'},
  {name:'MIA 1',team:'MIA',status:'Doubtful'}]);
 assert.ok(!mixed.playerProjections.some(x=>x.name==='BOS 2'||x.name==='MIA 1'));
});
test('missing sufficient source data leaves all tiers Not Ready, never synthetic prices',()=>{
 const result=nbaBuildPregameModels({gameId:game.gameId,home:'BOS',away:'MIA',
  tipoff:game.kickoff,roster,historical:[past(1,'BOS'),past(2,'MIA')]});
 assert.deepEqual(result.sgps.map(x=>x.status),['NOT_READY','NOT_READY','NOT_READY','NOT_READY']);
 assert.ok(result.sgps.every(x=>x.legs.length===0&&x.combinedBookOdds===null));
});
test('NBA T-30 and day-before windows revalidate early and later than thirty minutes',()=>{
 const tip=Date.parse(game.kickoff);
 const early=nbaPregameStage(game,null,{now:tip-26*3600000});
 assert.deepEqual([early.stage,early.due],['DAY_AHEAD_BUILD',true]);
 const valid={checkedAt:new Date(tip-26*3600000).toISOString(),stage:'DAY_AHEAD_BUILD'};
 assert.equal(nbaPregameStage(game,valid,{now:tip-25*3600000}).due,true); // one-hour day-ahead refresh
 assert.equal(nbaPregameStage(game,valid,{now:tip-19*3600000}).due,true);
 assert.equal(nbaPregameStage(game,valid,{now:tip-25*60000}).stage,'FINAL_T_MINUS_30');
 const check=nbaPregameStage(game,valid,{now:tip-25*60000});
 assert.equal(check.due,true);
 assert.equal(nbaPregameStage(game,valid,{now:tip+5000}).due,false);
});
test('NBA collector persists newly rebuilt candidates, last injury check, AI advisory only on T-30',async()=>{
 const tip=Date.parse(game.kickoff);
 const observed={
  header:{competitions:[{id:game.gameId,competitors:[
   {team:{abbreviation:'BOS'}},{team:{abbreviation:'MIA'}}]}]},
  injuries:[{team:{abbreviation:'BOS'},injuries:[
   {athlete:{displayName:'BOS 2'},status:'Out'}]}]
 };
 const saved=[];
 const deps={
  prepare:async(input)=>build(input.injuries),
  fetchJson:async()=>observed,
  review:async()=>({status:'REVIEWED',provider:'groq',canAlterPicks:false}),
  write:async d=>saved.push(d)
 };
 const first=await nbaCollectPregame(game,{...deps,now:tip-26*3600000});
 assert.equal(first.stage,'DAY_AHEAD_BUILD');
 assert.equal(saved[0].aiReviewed,false);
 assert.equal(saved[0].injuryChecks.reported,1);
 assert.ok(!saved[0].playerProjections.some(x=>x.name==='BOS 2'));
 const second=await nbaCollectPregame(game,{...deps,now:tip-25*60000,prior:saved[0]});
 assert.equal(second.stage,'FINAL_T_MINUS_30');
 assert.equal(saved[1].aiReviewed,true);
 assert.equal(saved[1].aiReview.provider,'groq');
 assert.equal(saved[1].aiReview.canAlterPicks,false);
 assert.ok(saved[1].sgps.every(x=>x.combinedBookOddsVerified===false));
 assert.equal(nbaPregameStatus(saved[1]).stage,'FINAL_T_MINUS_30');
});
test('NBA pregame reviewer cannot modify picks and calls Groq/OpenRouter endpoint at most once',async()=>{
 const data=build();
 const evidence=pregameAiEvidence('nba',game,{...data,sgps:data.sgps,verifiedInjuries:[]});
 assert.ok(evidence.sgps.length<=3,'only validated model candidates enter AI review');
 assert.ok(evidence.sgps.every(x=>x.combinedBookQuoteVerified===false));
 const calls=[];
 const reply=await pregameAiAudit('nba',game,{...data,sgps:data.sgps},{
  fetcher:async(url,options)=>{
   calls.push({url,body:JSON.parse(options.body)});
   return {ok:true,json:async()=>({ok:true,provider:'openrouter',analysis:'Review only'})}
  },base:'https://example.test'
 });
 assert.equal(reply.status,'REVIEWED');
 assert.equal(reply.provider,'openrouter');
 assert.equal(reply.canAlterPicks,false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].body.mode,'nbaPregame');
 const nope=await pregameAiAudit('nba',game,{sgps:[]},{fetcher:async()=>{throw Error('should not call')}});
 assert.equal(nope.status,'SKIPPED');
});
test('stale NFL snapshot becomes NOT_READY when injury/recent data invalidates every parlay',()=>{
 const snap=historySnap({...game,home:{abbr:'BOS'},away:{abbr:'MIA'}},{
  ok:true,categories:{},sgps:{Analytics:[]},
  validation:{injuryEligibilityChecked:true,blockedPlayerCount:12}
 });
 assert.equal(snap.modelDataStatus,'NOT_READY');
 assert.equal(snap.modelTierReadiness.Nuke.status,'NOT_READY');
 assert.equal(snap.injuryChecks.blockedPlayerCount,12);
});
test('both protected cron routes, separate T-30 schedules, and NBA game readout are wired',async()=>{
 const env=process.env.CRON_SECRET;
 delete process.env.CRON_SECRET;
 try{
  let result;
  const res={setHeader(){return this},status(n){this.statusCode=n;return this},
   json(obj){result=obj;return this}};
  await nbaCollector({method:'GET',headers:{}},res);
  assert.equal(res.statusCode,401);
  assert.equal(result.error,'cron_auth_required');
 }finally{if(env!==undefined)process.env.CRON_SECRET=env}
 const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(cfg.crons.some(x=>x.path==='/api/nfl-health?cron=1'&&x.schedule==='*/15 * * * *'));
 assert.ok(cfg.crons.some(x=>x.path==='/api/nba-health'&&x.schedule==='*/15 * * * *'));
 const nba=readFileSync(new URL('../api/nba-game.js',import.meta.url),'utf8');
 assert.ok(nba.includes('nbaReadPregame(gameId)'));
 const ui=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.ok(ui.includes('MODEL-ONLY CANDIDATE'));
 const ai=readFileSync(new URL('../api/ai-analysis.js',import.meta.url),'utf8');
 assert.ok(ai.includes('nbaPregame'));
 const nfl=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 assert.ok(nfl.includes("pregameAiAudit('nfl'"));
 assert.ok(nfl.includes('snap.priorCandidateInvalidated'));
});

test('NBA day-before continues from verified roster/history when game summary not published, but injuries remain UNVERIFIED',async()=>{
 const now=Date.parse(game.kickoff)-25*3600000,saved=[];
 const outcome=await nbaCollectPregame(game,{now,prior:null,
  fetchJson:async()=>{throw Error('ESPN upcoming summary not published')},
  prepare:async()=>build(),
  review:async()=>{throw Error('T-30 AI must not run day before')},
  write:async x=>saved.push(x)
 });
 assert.equal(outcome.stage,'DAY_AHEAD_BUILD');
 assert.equal(saved[0].injuryCheckedAt,null);
 assert.equal(saved[0].injuryReportStatus,'ESPN_SUMMARY_UNAVAILABLE');
 assert.match(saved[0].injuryLimitations,/UNVERIFIED/);
 assert.equal(saved[0].aiReviewed,false);
 assert.ok(saved[0].sgps.every(x=>x.combinedBookOddsVerified===false));
});
