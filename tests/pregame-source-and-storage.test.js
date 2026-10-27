import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nbaCompletedTeamGames,nbaTeamSeasonScheduleUrl,nbaRosterEvidence,nbaPrepareEvidence} from '../lib/nba-pregame-model.js';
import {nbaPregameStage,NBA_PREGAME_MODEL_VERSION} from '../api/nba-health.js';
import nbaCron from '../api/nba-health.js';
import nflCron,{nflCronAuthorized} from '../api/nfl-health.js';
import bdlCron from '../api/bdl-refresh.js';
import {pregameReadiness} from '../api/pregame-readiness.js';
const game={gameId:'401810101',home:{id:'2',abbr:'BOS'},away:{id:'16',abbr:'MIA'},
 seasonYear:2027,seasonType:1,stage:'PRESEASON',status:'SCHEDULED',
 kickoff:'2026-10-12T00:30:00Z'};
const response=()=>({setHeader(){return this},status(n){this.code=n;return this},
 json(x){this.data=x;return this}});
test('NBA historical schedule requests use ESPN season and season type (preseason vs regular season)',()=>{
 assert.equal(nbaTeamSeasonScheduleUrl('2',{seasonYear:2027,seasonType:1}),
 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/2/schedule?season=2027&seasontype=1&limit=100');
 assert.match(nbaTeamSeasonScheduleUrl('16',{seasonYear:2027,seasonType:2}),/seasontype=2/);
 assert.throws(()=>nbaTeamSeasonScheduleUrl('nba',{seasonYear:2027,seasonType:1}));
 assert.throws(()=>nbaTeamSeasonScheduleUrl('2',{seasonYear:2027,seasonType:4}));
});
test('completed NBA team schedule accepts both ESPN event and competition status nesting',()=>{
 const payload={events:[
  {id:'401800001',date:'2026-10-02T00:00:00Z',
   status:{type:{state:'post'}}},
  {id:'401800002',date:'2026-10-09T00:00:00Z',
   competitions:[{status:{type:{state:'post'}}}]},
  {id:'401800003',date:'2026-10-11T10:00:00Z',
   competitions:[{status:{type:{state:'pre'}}}]}
 ]};
 assert.deepEqual(nbaCompletedTeamGames(payload,game.kickoff),['401800002','401800001']);
});
test('ESPN NBA roster handles direct athlete rows and grouped roster variants',()=>{
 const input=[
 {team:'BOS',data:{athletes:[{id:'1001',displayName:'Player Alpha',status:{type:'active'}}]}},
 {team:'MIA',data:{athletes:[{position:'G',items:[
  {id:'2001',displayName:'Player Beta',status:{type:'active'}}]}]}}
 ];
 const r=nbaRosterEvidence(input,'BOS','MIA');
 assert.deepEqual([...r.keys()],['1001','2001']);
 assert.equal(r.get('2001').team,'MIA');
});
test('NBA evidence fetcher requests each current team with season-specific schedule, no paid feeds',async()=>{
 const urls=[];
 const noop=async url=>{
  urls.push(url);
  if(url.endsWith('/roster'))return {athletes:[{id:'102',displayName:'Test',status:{name:'Active'}}]};
  return {events:[]};
 };
 const result=await nbaPrepareEvidence(game,{fetchJson:noop});
 assert.equal(result.status,'NOT_READY');
 assert.equal(urls.length,4);
 assert.equal(urls.filter(x=>x.includes('season=2027&seasontype=1')).length,2);
 assert.equal(urls.filter(x=>x.endsWith('/roster')).length,2);
});
test('cached pregame model version is invalidated to rebuild corrected season-aware data',()=>{
 const now=Date.parse(game.kickoff)-24*3600000;
 const stale={checkedAt:new Date(now).toISOString(),stage:'DAY_AHEAD_BUILD',modelVersion:'v1'};
 const plan=nbaPregameStage(game,stale,{now:now+60000});
 assert.equal(plan.due,true);
 assert.equal(plan.reason,'model_version_changed');
 assert.ok(NBA_PREGAME_MODEL_VERSION==='v14-labeled-opening-week-historical-research');
});
test('untrusted public cron queries are rejected for NFL and NBA, without triggering paid market or other calls',async()=>{
 const oldCron=process.env.CRON_SECRET,oldStorage=process.env.BLOB_READ_WRITE_TOKEN;
 process.env.CRON_SECRET='regression-secret';
 delete process.env.BLOB_READ_WRITE_TOKEN;
 const oldFetch=globalThis.fetch;let called=0;
 globalThis.fetch=async()=>{called++;throw Error('should never fetch upstream')};
 try{
  assert.equal(nflCronAuthorized({headers:{}},'regression-secret'),false);
  assert.equal(nflCronAuthorized({headers:{authorization:'Bearer regression-secret'}},'regression-secret'),true);
  const a=response();await nflCron({query:{cron:'1'},headers:{host:'example.test'}},a);
  assert.equal(a.code,401);
  const b=response();await nflCron({query:{cron:'1'},headers:{
   authorization:'Bearer regression-secret',host:'example.test'}},b);
  assert.equal(b.code,503);
  assert.equal(b.data.error,'pregame_storage_not_configured');
  const c=response();await nbaCron({method:'GET',query:{},headers:{authorization:'Bearer regression-secret'}},c);
  assert.equal(c.code,503);
  assert.equal(c.data.error,'pregame_storage_not_configured');
  assert.equal(called,0);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldCron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldCron;
  if(oldStorage===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=oldStorage;
 }
});
test('BDL free cron will not use scarce free requests when Blob storage is disconnected',async()=>{
 const oldCron=process.env.CRON_SECRET,oldApi=process.env.BALLDONTLIE_API_KEY,
 oldBlob=process.env.BLOB_READ_WRITE_TOKEN;
 process.env.CRON_SECRET='test-cron';
 process.env.BALLDONTLIE_API_KEY='dummy-key';
 delete process.env.BLOB_READ_WRITE_TOKEN;
 try{
  const res=response();await bdlCron({method:'GET',
   headers:{authorization:'Bearer test-cron'}},res);
  assert.equal(res.code,503);
  assert.equal(res.data.error,'bdl_cache_storage_not_configured');
 }finally{
  if(oldCron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldCron;
  if(oldApi===undefined)delete process.env.BALLDONTLIE_API_KEY;else process.env.BALLDONTLIE_API_KEY=oldApi;
  if(oldBlob===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=oldBlob;
 }
});
test('public operational readiness exposes no secrets, only configuration and next steps',()=>{
 const bad=pregameReadiness({CRON_SECRET:'secret'});
 assert.equal(bad.status,'BLOCKED');
 assert.equal(bad.nfl.collectorReady,false);
 assert.equal(bad.nba.collectorReady,false);
 assert.equal(bad.storage.configured,false);
 assert.ok(!JSON.stringify(bad).includes('secret'));
 const good=pregameReadiness({CRON_SECRET:'secret',BLOB_READ_WRITE_TOKEN:'private'});
 assert.equal(good.status,'CONFIGURED');
 assert.equal(good.storage.validated,false,'configured token does not independently verify actual Blob I/O');
 assert.equal(good.nba.sportsbookOddsVerified,false);
 assert.ok(!JSON.stringify(good).includes('private'));
 const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(cfg.crons.some(x=>x.path==='/api/nfl-health?cron=1'));
 assert.ok(cfg.crons.some(x=>x.path==='/api/nba-health'));
});
