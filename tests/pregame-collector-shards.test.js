import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectedShardGames,shardForGame,COLLECTOR_SHARDS,
 collectorAuditPath,collectorAuditReport,collectorTierCoverage,readCollectorAudits,writeCollectorAudit}
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
 assert.equal(report.results[0].rawSgpRecordCount,3);
 assert.equal(report.results[0].coverage,'UNVERIFIED',
  'A raw 3-record count alone does not prove three verified model tiers');
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


test('league-wide SGP audit separates all three model tiers from unquoted book duplicates',()=>{
 const nfl=collectorAuditReport('nfl',0,[
  {gameId:'401872981',status:'updated',picks:4,sgps:9,stage:'DAY_AHEAD_BUILD',
   modelTierReadiness:{
    Small:{status:'MODEL_CANDIDATE',legs:4},
    Medium:{status:'MODEL_CANDIDATE',legs:5},
    Nuke:{status:'MODEL_CANDIDATE',legs:5}
   }},
  {gameId:'401872988',status:'updated',picks:5,sgps:0,stage:'DAY_AHEAD_BUILD',
   modelTierReadiness:{
    Small:{status:'NOT_READY',reason:'Passing yardage evidence unavailable'},
    Medium:{status:'NOT_READY',reason:'No eligible receiving yardage'},
    Nuke:{status:'NOT_READY',reason:'Injury review pending'}
   }}
 ],{now,startedAt:'2026-10-11T00:55:00Z',due:2});
 assert.equal(nfl.successful,2,'an operationally successful refresh is not proof of a qualified SGP');
 assert.equal(nfl.failed,0);
 assert.deepEqual(nfl.coverage,{full:1,partial:0,none:1,unverified:0});
 assert.deepEqual(nfl.results[0].readyTiers,['Small','Medium','Nuke']);
 assert.equal(nfl.results[0].modelCandidateCount,3);
 assert.equal(nfl.results[0].rawSgpRecordCount,9);
 assert.equal(nfl.results[1].coverage,'NO_QUALIFIED_TIERS');
 assert.deepEqual(nfl.results[1].missingTiers,['Small','Medium','Nuke']);
 assert.match(nfl.results[1].tierReasons.Small,/Passing yardage/);
 assert.ok(!JSON.stringify(nfl).includes('"legs"'));
});
test('NBA uses returned modelTiers rather than non-existent raw sgps count',()=>{
 const reports=collectorAuditReport('nba',1,[
  {gameId:'401908941',status:'MODEL_ONLY',stage:'DAY_AHEAD_BUILD',
   modelTiers:['Small','Medium','Nuke']},
  {gameId:'401898400',status:'NOT_READY',stage:'DAY_AHEAD_BUILD',
   modelTiers:[],reason:'No roster sample'},
  {gameId:'401899999',status:'MODEL_ONLY',stage:'FINAL_T_MINUS_30',
   modelTiers:['Small','Medium']}
 ],{now,due:3});
 assert.deepEqual(reports.coverage,{full:1,partial:1,none:1,unverified:0});
 assert.equal(reports.results[0].modelCandidateCount,3);
 assert.equal(reports.results[0].rawSgpRecordCount,0,
  'NBA JSON has modelTiers, not a misleading raw SGP count');
 assert.equal(reports.results[1].coverage,'NO_QUALIFIED_TIERS');
 assert.equal(reports.results[2].coverage,'PARTIAL_TIERS');
 assert.deepEqual(reports.results[2].missingTiers,['Nuke']);
});
test('missing model tiers never silently count as ready; runtime/Blob failures remain separate',()=>{
 const failed=collectorAuditReport('nfl',0,[
  {gameId:'401872981',status:'collector_error',error:'timeout'},
  {gameId:'401872982',status:'markets_unavailable'},
  {gameId:'401872983',status:'no_qualified_model_data'}
 ],{now,due:3});
 assert.equal(failed.failed,2);
 assert.equal(failed.coverage.unverified,2);
 assert.equal(failed.coverage.none,1);
 const absent=collectorTierCoverage({gameId:'401872981',sgps:9});
 assert.equal(absent.coverage,'UNVERIFIED');
 assert.equal(absent.modelCandidateCount,0);
 const wrong=collectorTierCoverage({status:'updated',
  modelTierReadiness:{Small:{status:'MODEL_CANDIDATE'}}});
 assert.equal(wrong.coverage,'PARTIAL_TIERS');
 assert.deepEqual(wrong.missingTiers,['Medium','Nuke']);
});
test('read collector audits sums three-tier readiness separately from collector success',async()=>{
 const first=collectorAuditReport('nfl',0,[{
  gameId:'401872981',status:'updated',modelTierReadiness:{
   Small:{status:'MODEL_CANDIDATE'},Medium:{status:'MODEL_CANDIDATE'},Nuke:{status:'MODEL_CANDIDATE'}}}
 ],{now,due:1});
 const second=collectorAuditReport('nfl',1,[{
  gameId:'401872982',status:'no_qualified_model_data',modelTierReadiness:{
   Small:{status:'NOT_READY'},Medium:{status:'NOT_READY'},Nuke:{status:'NOT_READY'}}}
 ],{now,due:1});
 const result=await readCollectorAudits('nfl',{now:now+60000,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:'https://example.test/'+prefix}]}),
  fetchBlob:async url=>({ok:true,json:async()=>url.includes('shard-0')?first:second})});
 assert.equal(result.summary.successful,2);
 assert.equal(result.summary.coverage.full,1);
 assert.equal(result.summary.coverage.none,1);
 assert.equal(result.summary.incompleteShards,0);
 const expired=await readCollectorAudits('nfl',{now:now+45*60000,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:'https://example.test/'+prefix}]}),
  fetchBlob:async url=>({ok:true,json:async()=>url.includes('shard-0')?first:second})});
 assert.equal(expired.summary.staleShards,2);
 assert.equal(expired.summary.incompleteShards,2);
});

test('old model snapshots without tier status are UNVERIFIED, never silently zero coverage',async()=>{
 const prior={league:'nfl',shard:0,state:'COMPLETE',
  checkedAt:new Date(now).toISOString(),due:2,attempted:2,successful:2,failed:0,
  results:[
   {gameId:'401872981',status:'updated',sgpCount:9,changed:true},
   {gameId:'401872990',status:'updated',sgpCount:9,changed:true}
  ]};
 const second=collectorAuditReport('nfl',1,[{gameId:'401872988',
  status:'no_qualified_model_data',modelTierReadiness:{
   Small:{status:'NOT_READY'},Medium:{status:'NOT_READY'},Nuke:{status:'NOT_READY'}
  }}],{now,due:1});
 const result=await readCollectorAudits('nfl',{now:now+60_000,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:prefix}]}),
  fetchBlob:async url=>({ok:true,json:async()=>url.endsWith('shard-0.json')?prior:second})});
 assert.equal(result.summary.successful,3);
 assert.equal(result.summary.coverage.unverified,2);
 assert.equal(result.summary.coverage.none,1);
 assert.equal(result.summary.coverage.full,0);
 assert.equal(result.shards[0].results[0].coverage,'UNVERIFIED');
 assert.equal(result.shards[0].results[0].rawSgpRecordCount,undefined);
});
test('stale or incomplete shard records cannot claim current 3-of-3 model coverage',async()=>{
 const complete=collectorAuditReport('nfl',0,[{gameId:'401872981',status:'updated',
  modelTierReadiness:Object.fromEntries(['Small','Medium','Nuke'].map(r=>[
   r,{status:'MODEL_CANDIDATE',legs:5}]))}],{now,due:1});
 const stale=collectorAuditReport('nfl',1,[{gameId:'401872990',status:'updated',
  modelTierReadiness:Object.fromEntries(['Small','Medium','Nuke'].map(r=>[
   r,{status:'MODEL_CANDIDATE',legs:5}]))}],{now:now-40*60000,due:1});
 const loaded=await readCollectorAudits('nfl',{now:now+60000,
  listBlobs:async({prefix})=>({blobs:[{pathname:prefix,url:prefix}]}),
  fetchBlob:async url=>({ok:true,json:async()=>url.endsWith('shard-0.json')?complete:stale})});
 assert.equal(loaded.summary.coverage.full,1);
 assert.equal(loaded.summary.coverage.unverified,1);
 assert.equal(loaded.summary.incompleteShards,1);
});
test('operational audit exposes only normalized causes when injury, prop and matchup change',()=>{
 const result=collectorAuditReport('nba',1,[{
  gameId:'401901821',status:'MODEL_ONLY',
  modelTiers:['Small','Medium','Nuke'],
  changedFields:['INJURIES','PLAYER_PROPS','MATCHUP','some_private_key'],
  changed:true
 }],{now});
 assert.deepEqual(result.results[0].changedFields,['INJURIES','PLAYER_PROPS','MATCHUP']);
 assert.equal(result.results[0].coverage,'READY_3_OF_3');
 assert.ok(!JSON.stringify(result).includes('some_private_key'));
});
