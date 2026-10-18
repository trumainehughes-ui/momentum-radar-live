import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {nflDayAheadAiReviewDue,NFL_DAY_AHEAD_AI_COOLDOWN_MS}
 from '../lib/nfl-scheduled-ai-review.js';
import {publicNflRefreshState} from '../lib/nfl-public-refresh-state.js';
import {collectorAuditReport} from '../lib/pregame-collector-shards.js';

const start=Date.parse('2026-10-17T01:00:00Z');
const game={gameId:'401872996',status:'SCHEDULED',
 kickoff:'2026-10-18T13:30:00Z',
 home:{abbr:'JAX'},away:{abbr:'HOU'}};
test('first scheduled day-ahead model is AI-reviewed while final-check rule still applies',()=>{
 assert.equal(nflDayAheadAiReviewDue({stage:'DAY_AHEAD_BUILD',
  changedFields:['FIRST_SNAPSHOT'],now:start}),true);
 assert.equal(nflDayAheadAiReviewDue({stage:'DAY_AHEAD_BUILD',
  changedFields:['INJURIES'],now:start}),true);
 assert.equal(nflDayAheadAiReviewDue({stage:'DAY_AHEAD_BUILD',
  changedFields:['INJURIES'],prior:{aiReviewAttemptAt:new Date(start-5*60000).toISOString()},
  now:start}),false);
 assert.equal(nflDayAheadAiReviewDue({stage:'DAY_AHEAD_BUILD',
  changedFields:['INJURIES'],prior:{aiReviewAttemptAt:new Date(start-NFL_DAY_AHEAD_AI_COOLDOWN_MS).toISOString()},
  now:start}),true);
 assert.equal(nflDayAheadAiReviewDue({stage:'DAY_AHEAD_BUILD',
  changedFields:[],now:start}),false);
 assert.equal(nflDayAheadAiReviewDue({stage:'FINAL_T_MINUS_30',
  changedFields:['INJURIES'],now:start}),false);
});
test('before day-ahead collection window the public status names first eligible cron without starting it',()=>{
 const s=publicNflRefreshState(game,null,{now:start});
 assert.equal(s.phase,'WAITING_DAY_AHEAD_WINDOW');
 assert.equal(s.nextEligibleAt,'2026-10-17T07:30:00.000Z');
 assert.equal(s.nextScheduledTick,s.nextEligibleAt);
 assert.equal(s.cadenceMinutes,15);
 assert.equal(s.lastAttempt,null);
 assert.equal(s.scope,'AUTOMATIC_SIGNED_COLLECTOR_ONLY');
});
test('due games show pending 15-minute scheduled cycle if no actual collector record exists',()=>{
 const now=Date.parse('2026-10-17T13:31:00Z');
 const s=publicNflRefreshState(game,null,{now});
 assert.equal(s.phase,'SCHEDULED_RECHECK_WINDOW');
 assert.equal(s.nextScheduledTick,'2026-10-17T13:45:00.000Z');
 assert.equal(s.lastAttempt,null);
});
test('only a matching current-shard signed audit can report an actual AI or sportsbook attempt',()=>{
 const now=Date.parse('2026-10-17T13:31:00Z');
 const audit=collectorAuditReport('nfl',0,[{gameId:game.gameId,status:'updated',
  aiReview:'REVIEWED',bookCheckpoint:{status:'MARKET_REFRESHED',stage:'DAY_AHEAD'},
  injuryWatch:{status:'compared'},modelTierReadiness:{
   Small:{status:'MODEL_CANDIDATE'},Medium:{status:'MODEL_CANDIDATE'},
   Nuke:{status:'NOT_READY'}
  }}],{now,startedAt:new Date(now-60000).toISOString(),due:1});
 const s=publicNflRefreshState(game,{shards:[{...audit,status:'COMPLETE'}]},{now});
 assert.equal(s.lastAttempt.collectorStatus,'updated');
 assert.equal(s.lastAttempt.aiReview,'REVIEWED');
 assert.equal(s.lastAttempt.bookCheckpoint,'MARKET_REFRESHED');
 assert.equal(s.lastAttempt.injuryCheck,'compared');
 assert.equal(s.lastAttempt.modelTierCoverage,'PARTIAL_TIERS');
 assert.equal(publicNflRefreshState(game,{shards:[{...audit,status:'STALE'}]},{now}).lastAttempt,null);
 assert.equal(publicNflRefreshState(game,{shards:[{...audit,status:'COMPLETE',
  results:[{gameId:'401872997',status:'updated'}]}]},{now}).lastAttempt,null);
});
test('public endpoint invokes no signed cron, market build, change tokens, or AI provider',()=>{
 const endpoint=readFileSync(new URL('../api/public-nfl-recheck-status.js',import.meta.url),'utf8');
 const collector=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 for(const code of ['CRON_SECRET','PLAYER_PROPS_API_KEY','/api/nfl-markets?',
  '/api/ai-analysis','x-momentum-change-token','verifiedChange=1'])
  assert.ok(!endpoint.includes(code),code);
 assert.ok(endpoint.includes("readCollectorAudits('nfl')"));
 assert.ok(endpoint.includes('publicNflRefreshState(game,audits'));
 assert.ok(collector.includes('nflDayAheadAiReviewDue({stage:snap.lockStage'));
 assert.ok(collector.includes('snap.aiReviewAttemptAt=new Date().toISOString()'));
 assert.ok(collector.includes('pregameAiAudit('));
 assert.ok(collector.includes('if(cron&&!nflCronAuthorized('));
});
test('stale public SGP shows automatic check schedule, status and existing picks, without issuing bookmaker write',()=>{
 const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.ok(page.includes('Needs refresh · Saved model selections'));
 assert.ok(page.includes('renderAutoRecheckStatus()'));
 assert.ok(page.includes("getJson('/api/public-nfl-recheck-status?'"));
 assert.ok(page.includes('loadNflRecheckStatus(date,id)'));
 assert.ok(page.includes('loadNflRecheckStatus(state.date,String(id))'));
 assert.ok(page.includes('state.selected?refreshReadOnlyPredictions():loadSlate(false)'));
 assert.ok(page.includes("const snapshotFresh=d?.ok===true&&d?.status==='CURRENT'"));
 assert.ok(page.includes('const savedTiers=snapshotFresh&&Array.isArray(d.modelResearchTiers)'));
 assert.ok(page.includes('Previously saved predictions are expired'));
 assert.ok(!page.includes("getJson('/api/nfl-markets?"));
});
