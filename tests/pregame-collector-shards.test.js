import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectedShardGames,shardForGame,COLLECTOR_SHARDS,
 collectorAuditPath,collectorAuditReport,collectorTierSummary,readCollectorAudits,writeCollectorAudit}
 from '../lib/pregame-collector-shards.js';
import {nflCollectorDueGames} from '../lib/nfl-collector-readiness.js';
import nflCron from '../api/nfl-health.js';
import nbaCron from '../api/nba-health.js';
import auditApi from '../api/pregame-collector-status.js';

const ids=['401872981','401872990','401872984','401872982','401872986',
 '401872987','401872983','401872985','401872988','401872989',
 '401872991','401872992','401872993'];
const now=Date.parse('2026-10-11T01:00:00Z');
const nflGames=ids.map((gameId,i)=>({gameId,status:'SCHEDULED',
 kickoff:new Date(now+(i%4+14)*3600000).toISOString()}));

test('13 NFL Sunday games are assigned exactly once across both sharded 15-minute collectors',()=>{
 assert.equal(COLLECTOR_SHARDS,2);
 const due=nflCollectorDueGames(nflGames,{now});
 assert.equal(due.length,13);
 const zero=selectedShardGames(due,0),one=selectedShardGames(due,1);
 assert.equal(zero.length+one.length,13);
 assert.ok(zero.length>=5&&one.length>=5);
 assert.deepEqual([...zero,...one].map(x=>x.gameId).sort(),ids.slice().sort());
 assert.equal(new Set([...zero,...one].map(x=>x.gameId)).size,13);
 assert.ok(zero.every(x=>shardForGame(x.gameId)===0));
 assert.ok(one.every(x=>shardForGame(x.gameId)===1));
 assert.deepEqual(selectedShardGames([...nflGames,nflGames[0]],0),zero);
 assert.throws(()=>selectedShardGames(nflGames,2),/invalid_collector_shard/);
 assert.equal(shardForGame('../../bad'),null);
});
test('all NBA games in upcoming window are sharded identically without popularity filtering',()=>{
 const nba=Array.from({length:18},(_,i)=>({
  gameId:String(402000001+i),status:'SCHEDULED',
  kickoff:new Date(now+24*3600000).toISOString()}));
 const assigned=[...selectedShardGames(nba,0),...selectedShardGames(nba,1)];
 assert.equal(assigned.length,18);
 assert.equal(new Set(assigned.map(x=>x.gameId)).size,18);
});
test('cron config preserves previously protected endpoints and adds both league second shards',()=>{
 const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 const expected=['/api/nfl-health?cron=1','/api/nfl-health?cron=1&shard=1',
  '/api/nba-health','/api/nba-health?shard=1'];
 for(const endpoint of expected){
  assert.ok(cfg.crons.some(x=>x.path===endpoint&&x.schedule==='*/15 * * * *'),endpoint);
 }
 assert.equal(cfg.crons.filter(x=>x.path.startsWith('/api/nfl-health')).length,2);
 assert.equal(cfg.crons.filter(x=>x.path.startsWith('/api/nba-health')).length,2);
});
test('collector audits expose per-game failed and successful statuses without private picks',async()=>{
 const report=collectorAuditReport('nfl',1,[
  {gameId:'401872981',status:'updated',stage:'DAY_AHEAD_BUILD',picks:5,sgps:3,
   changed:true,changedFields:['PLAYER_PROPS']},
  {gameId:'401872982',status:'markets_unavailable',httpStatus:503},
  {gameId:'401872983',status:'no_qualified_model_data',picks:2,sgps:0},
  {gameId:'401872984',status:'collector_error',error:'timeout'}
 ],{now,state:'COMPLETE',startedAt:'2026-10-11T00:45:00Z',due:4});
 assert.equal(report.attempted,4);
 assert.equal(report.successful,2);
 assert.equal(report.failed,2);
 assert.equal(report.results[0].sgpCount,3);
 assert.equal(report.results[0].changed,true);
 assert.ok(!JSON.stringify(report).includes('"legs"'));
 assert.equal(collectorAuditPath('nba',0),'momentum-ops/v1/pregame-collector-nba-shard-0.json');
 assert.throws(()=>collectorAuditPath('mlb',0),/invalid_collector_identity/);
 const persisted=[];
 assert.ok(await writeCollectorAudit(report,{putBlob:async(path,json,options)=>{
  persisted.push({path,json:JSON.parse(json),options});
 }}));
 assert.equal(persisted.length,1);
 assert.equal(persisted[0].options.allowOverwrite,true);
 assert.equal(persisted[0].json.failed,2);
});
test('read-only health API distinguishes missing shard reports, stale snapshots and genuine successes',async()=>{
 const ts=Date.parse('2026-10-11T01:00:00Z'),
  one=collectorAuditReport('nfl',0,[{gameId:'401872981',status:'locked',picks:4,sgps:3}],
   {now:ts,startedAt:'2026-10-11T00:59:00Z',due:1}),
  two=collectorAuditReport('nfl',1,[],{now:ts,state:'RUNNING',due:6});
 const loaded=await readCollectorAudits('nfl',{now:ts+2*60000,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:'https://blob.example/'+prefix}]}),
  fetchBlob:async(url)=>({ok:true,json:async()=>url.endsWith('shard-0.json')?one:two})});
 assert.equal(loaded.summary.shards,2);
 assert.equal(loaded.summary.reported,1);
 assert.equal(loaded.summary.due,7);
 assert.equal(loaded.summary.successful,1);
 assert.equal(loaded.shards[0].status,'COMPLETE');
 assert.equal(loaded.shards[1].status,'RUNNING');
 const missing=await readCollectorAudits('nba',{listBlobs:async()=>({blobs:[]})});
 assert.equal(missing.shards[0].status,'NO_COLLECTOR_AUDIT');
 const stale=await readCollectorAudits('nfl',{now:ts+40*60000,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:'https://blob.example/'+prefix}]}),
  fetchBlob:async url=>({ok:true,json:async()=>url.endsWith('shard-0.json')?one:two})});
 assert.ok(stale.shards.every(x=>x.status==='STALE'));
});
test('anonymous visitors cannot impersonate either sharded cron or write collector audit',async()=>{
 const makeRes=()=>({statusCode:200,status(n){this.statusCode=n;return this},
  setHeader(){return this},json(v){this.result=v;return this}});
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='local-test-secret';
 const orig=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('should not fetch')};
 try{
  const nfl=makeRes(),nba=makeRes();
  await nflCron({method:'GET',query:{cron:'1',shard:'1'},headers:{}},nfl);
  await nbaCron({method:'GET',query:{shard:'1'},headers:{}},nba);
  assert.equal(nfl.statusCode,401);
  assert.equal(nba.statusCode,401);
  assert.equal(calls,0);
  const post=makeRes();await auditApi({method:'POST',query:{league:'nfl'}},post);
  assert.equal(post.statusCode,405);
  const bogus=makeRes();await auditApi({method:'GET',query:{league:'other'}},bogus);
  assert.equal(bogus.statusCode,400);
 }finally{
  globalThis.fetch=orig;
  if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;
 }
 const s=readFileSync(new URL('../api/pregame-collector-status.js',import.meta.url),'utf8');
 assert.ok(!/BALLDONTLIE_API_KEY|SPORTSGAMEODDS_API_KEY|GROQ_API_KEY|THE_ODDS_API_KEY/.test(s));
});

test('NFL counts actual qualified Small/Medium/Nuke tiers, not nine unquoted book cards',()=>{
 const full={gameId:'401872981',status:'updated',sgps:9,picks:5,
  modelTierReadiness:{
   Small:{status:'MODEL_CANDIDATE',legs:4},
   Medium:{status:'MODEL_CANDIDATE',legs:5},
   Nuke:{status:'MODEL_CANDIDATE',legs:5}
  },changedFields:['PLAYER_PROPS','INJURIES','MATCHUP','AN_UNEXPECTED_STRING']};
 const blocked={gameId:'401872988',status:'no_qualified_model_data',sgps:0,picks:2,
  modelTierReadiness:{
   Small:{status:'NOT_READY',legs:0},
   Medium:{status:'NOT_READY',legs:0},
   Nuke:{status:'NOT_READY',legs:0}
  }};
 const rep=collectorAuditReport('nfl',0,[full,blocked],{now});
 assert.equal(rep.successful,2,'successful processing is not a valid parlay');
 assert.equal(rep.readyGames,1);
 assert.equal(rep.incompleteModelGames,1);
 assert.equal(rep.unknownModelGames,0);
 assert.equal(rep.readyModelTiers,3);
 assert.equal(rep.results[0].allModelTiersReady,true);
 assert.equal(rep.results[0].unquotedCandidateRecords,9);
 assert.equal(rep.results[0].verifiedCombinedOdds,false);
 assert.deepEqual(rep.results[0].changedFields,['PLAYER_PROPS','INJURIES','MATCHUP']);
 assert.equal(rep.results[1].allModelTiersReady,false);
 assert.equal(rep.results[1].tiers.Nuke,'NOT_READY');
 assert.ok(!JSON.stringify(rep).includes('actualSgpOdds'));
});
test('NBA uses the same per-game tier reporting without implying sportsbook quotes',()=>{
 const report=collectorAuditReport('nba',1,[
  {gameId:'401901821',status:'MODEL_ONLY',modelTiers:['Small','Medium','Nuke']},
  {gameId:'401898400',status:'NOT_READY',modelTiers:[]}
 ],{now});
 assert.equal(report.readyGames,1);
 assert.equal(report.incompleteModelGames,1);
 assert.equal(report.readyModelTiers,3);
 assert.equal(report.results[0].tiers.Medium,'MODEL_CANDIDATE');
 assert.equal(report.results[1].tiers.Small,'NOT_READY');
 assert.equal(report.results[0].verifiedCombinedOdds,false);
 assert.equal(collectorTierSummary({sgps:9}).readyCount,null,
  'unverified raw book candidates cannot manufacture ready model tiers');
});
test('shard dashboard shows aggregate tier readiness separately from cron success',async()=>{
 const t=now;
 const left=collectorAuditReport('nfl',0,[{
  gameId:'401872981',status:'updated',modelTierReadiness:{
   Small:{status:'MODEL_CANDIDATE',legs:4},
   Medium:{status:'MODEL_CANDIDATE',legs:5},
   Nuke:{status:'MODEL_CANDIDATE',legs:5}
  }
 }],{now:t,due:1});
 const right=collectorAuditReport('nfl',1,[{
  gameId:'401872988',status:'updated',modelTierReadiness:{
   Small:{status:'NOT_READY',legs:0},Medium:{status:'NOT_READY',legs:0},
   Nuke:{status:'NOT_READY',legs:0}
  }
 }],{now:t,due:1});
 const out=await readCollectorAudits('nfl',{now:t+60000,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:prefix}]}),
  fetchBlob:async url=>({ok:true,json:async()=>url.endsWith('shard-0.json')?left:right})});
 assert.equal(out.summary.successful,2);
 assert.equal(out.summary.modelReadyGames,1);
 assert.equal(out.summary.modelIncompleteGames,1);
 assert.equal(out.summary.modelReadyTiers,3);
 assert.equal(out.summary.coverageCurrent,true);
});
