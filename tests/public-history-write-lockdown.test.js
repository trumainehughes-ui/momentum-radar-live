import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import nflGame,{nflHistoryWriteAuthorized} from '../api/nfl-game.js';
import {historySnap} from '../api/nfl-health.js';
const response=()=>({statusCode:200,body:null,headers:{},
 setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.statusCode=n;return this},json(x){this.body=x;return this}});
test('public visitor cannot POST fabricated picks into shared NFL history',async()=>{
 const oldSecret=process.env.CRON_SECRET,oldFetch=globalThis.fetch;let calls=0;
 process.env.CRON_SECRET='test-secret';
 globalThis.fetch=async()=>{calls++;throw Error('public history cannot cause backend fetch')};
 try{
  const bad=response();
  await nflGame({method:'POST',query:{gameId:'401811111'},headers:{},
   body:{action:'lock-history',game:{gameId:'401811111',kickoff:'2027-02-01T00:00:00Z'},
    picks:[{name:'Injected pick',threshold:500}]}},bad);
  assert.equal(bad.statusCode,401);
  assert.equal(bad.body.error,'history_write_auth_required');
  assert.equal(calls,0);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;
 }
});
test('only cron bearer authorizes writes; other actions and identity mismatch do not mutate',async()=>{
 assert.equal(nflHistoryWriteAuthorized({headers:{}},'test-secret'),false);
 assert.equal(nflHistoryWriteAuthorized({headers:{authorization:'Bearer test-secret'}},'test-secret'),true);
 assert.equal(nflHistoryWriteAuthorized({headers:{authorization:'Bearer wrong'}},'test-secret'),false);
 assert.equal(nflHistoryWriteAuthorized({headers:{authorization:'Bearer test-secret'}},''),false);
 const oldSecret=process.env.CRON_SECRET;
 process.env.CRON_SECRET='test-secret';
 try{
  const auth='Bearer test-secret';
  const mismatch=response();
  await nflGame({method:'POST',headers:{authorization:auth},
   query:{gameId:'401811111'},body:{action:'lock-history',game:{gameId:'401822222'}}},mismatch);
  assert.equal(mismatch.statusCode,409);
  assert.equal(mismatch.body.error,'history_game_id_mismatch');
  const noAction=response();
  await nflGame({method:'POST',headers:{authorization:auth},
   query:{gameId:'401811111'},body:{action:'unknown',game:{gameId:'401811111'}}},noAction);
  assert.equal(noAction.statusCode,400);
 }finally{
  if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;
 }
});
test('unauthenticated requests cannot trigger old history archive/delete through query parameters',async()=>{
 const oldSecret=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret';
 try{
  const rejected=response();
  await nflGame({method:'GET',query:{mode:'archive-history'},headers:{}},rejected);
  assert.equal(rejected.statusCode,401);
  assert.equal(rejected.body.error,'history_admin_auth_required');
 }finally{
  if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;
 }
});
test('GET history listing contains no auto-archive write side effects; daily cron maintains history',()=>{
 const code=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const cron=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(code.includes("mode==='history-list'"));
 assert.ok(!code.includes('await archiveOldHistory(all)'));
 assert.ok(code.includes("mode==='archive-history'"));
 assert.ok(ui.includes("mode=history-grade"));
 assert.ok(ui.includes("mode=history-list"));
 assert.ok(!ui.includes("lock-history"));
 assert.ok(!ui.includes("lockNFLGame"));
 // The authenticated server collector already saves into the same exact
 // prefix consumed by the frontend's history API; never replace this with
 // client-submitted picks from untrusted visitors.
 assert.ok(cron.includes("const P='momentum-history/v1/nfl-'"));
 assert.ok(code.includes("const HISTORY_PREFIX='momentum-history/v1/nfl-'"));
 assert.ok(cron.includes("await put(P+g.gameId+'.json'"));
 assert.ok(cfg.crons.some(x=>x.path==='/api/nfl-game?mode=archive-history'&&x.schedule==='0 11 * * *'));
 assert.ok(cfg.crons.some(x=>x.path==='/api/nfl-health?cron=1'&&x.schedule==='*/10 * * * *'));
});
test('record source is server-generated, not client-submitted',()=>{
 const game={gameId:'401811111',kickoff:'2027-01-01T23:00:00Z',
  home:{abbr:'DEN'},away:{abbr:'KC'}};
 const snap=historySnap(game,{categories:{td:[]},sgps:{Analytics:[]},validation:{}});
 assert.equal(snap.lockSource,'SERVER_COLLECTOR');
 assert.equal(snap.gameId,game.gameId);
 assert.deepEqual(snap.sgps,[]);
});
