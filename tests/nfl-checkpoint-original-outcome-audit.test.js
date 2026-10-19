import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyNflCheckpointMarket,sanitizeNflCheckpointOutcome}
 from '../lib/nfl-checkpoint-outcome.js';
import {runNflScheduledBookCheckpoint}
 from '../lib/nfl-scheduled-book-checkpoint.js';
import {collectorAuditReport} from '../lib/pregame-collector-shards.js';
const now=Date.parse('2026-10-10T18:00:00Z');
const game={gameId:'401872992',kickoff:'2026-10-11T17:00:00Z',
 status:'SCHEDULED'};
const response=(overrides={})=>({ok:true,gameId:game.gameId,
 oddsDebug:{propLineChangeType:'scheduled_checkpoint',
  providerNativeRows:0,authorizedQuoteCandidates:0,
  propLineStage:'event_not_matched'},
 sgps:{DraftKings:[],FanDuel:[],combinedBookQuoteVerified:false},
 ...overrides});
const store=()=>{
 const data=new Map(),calls=[];
 const putBlob=async(path,raw,options)=>{
  if(!options.allowOverwrite&&data.has(path))throw Error('conflict');
  if(options.allowOverwrite!==path.includes('/outcomes/'))throw Error('claim must be create-only');
  data.set(path,JSON.parse(raw));calls.push(path);
 };
 const listBlobs=async({prefix})=>({blobs:[...data.keys()].filter(k=>k===prefix)
  .map(k=>({pathname:k,url:'https://blob.test/'+encodeURIComponent(k)}))});
 const fetchBlob=async(url)=>{
  const key=decodeURIComponent(url.split('/').slice(3).join('/'));
  return{ok:data.has(key),json:async()=>data.get(key)};
 };
 return{data,calls,putBlob,listBlobs,fetchBlob};
};
const config=(blob,extra={})=>({
 now,env:{MOMENTUM_PAID_SCHEDULED_CHECKPOINTS:'enabled'},base:'https://momentum-radar-live.vercel.app',
 secret:'dummy-test-signature',configured:true,putBlob:blob.putBlob,
 listBlobs:blob.listBlobs,fetchBlob:blob.fetchBlob,
 createToken:()=>('a'.repeat(64)),...extra
});
test('provider not matched is recorded and shown on later cron cycles without spending again',async()=>{
 const blob=store();let requested=0;
 const options=config(blob,{fetchMarket:async()=>{requested++;
  return{ok:true,json:async()=>response()}}});
 const first=await runNflScheduledBookCheckpoint(game,options);
 assert.equal(first.status,'MARKET_REFRESHED');
 assert.equal(first.outcomeStatus,'PROVIDER_EVENT_NOT_MATCHED');
 assert.equal(first.marketResponse.gameId,game.gameId);
 assert.equal(requested,1);
 const second=await runNflScheduledBookCheckpoint(game,options);
 assert.equal(second.status,'ALREADY_ATTEMPTED_OR_STORE_UNAVAILABLE');
 assert.equal(second.priorAttemptOutcome,'PROVIDER_EVENT_NOT_MATCHED');
 assert.equal(second.nativeOfferRows,0);
 assert.equal(requested,1);
 assert.equal(blob.calls.filter(k=>k.includes('/budget/')).length,1);
 const outcome=[...blob.data.entries()].find(([k])=>k.includes('/outcomes/'));
 assert.ok(outcome);
 assert.equal(outcome[1].status,'PROVIDER_EVENT_NOT_MATCHED');
 assert.equal(outcome[1].gameId,game.gameId);
 assert.equal(outcome[1].stage,'DAY_AHEAD');
 assert.ok(!JSON.stringify(outcome[1]).includes('dummy-test-signature'));
 assert.ok(!JSON.stringify(outcome[1]).includes('aaaaaaaa'));
});
test('actual provider odds are distinguished from unpriced offers and verified combined odds',()=>{
 assert.equal(classifyNflCheckpointMarket(response()).status,'PROVIDER_EVENT_NOT_MATCHED');
 assert.equal(classifyNflCheckpointMarket(response({
  oddsDebug:{propLineStage:'provider_response_unavailable'}})).status,
 'PROVIDER_REQUEST_FAILED');
 const offered=classifyNflCheckpointMarket(response({
  oddsDebug:{providerNativeRows:13,authorizedQuoteCandidates:1,
   propLineStage:'prop_line_market_ready'}}));
 assert.equal(offered.status,'PROVIDER_SELECTIONS_UNQUOTED');
 assert.equal(offered.nativeOfferRows,13);
 assert.equal(offered.quoteCandidates,1);
 const priced=classifyNflCheckpointMarket(response({
  oddsDebug:{providerNativeRows:14,authorizedQuoteCandidates:2},
  sgps:{combinedBookQuoteVerified:true,
   DraftKings:[{combinedBookQuoteVerified:true}],
   FanDuel:[{combinedBookQuoteVerified:false}]} }));
 assert.equal(priced.status,'PROVIDER_SELECTIONS_UNQUOTED');
 assert.equal(priced.verifiedBookTiers,0);
 assert.equal(classifyNflCheckpointMarket(response({
  oddsDebug:{providerNativeRows:0,authorizedQuoteCandidates:0},
  sgps:{combinedBookQuoteVerified:false,
   DraftKings:[{combinedBookQuoteVerified:true}],FanDuel:[]}
 })).status,'NO_PROVIDER_SELECTIONS');
});
test('provider HTTP outage keeps model fallback, original failure audit and no fake quote',async()=>{
 const blob=store(),options=config(blob,{fetchMarket:async()=>({ok:false,status:502})});
 const first=await runNflScheduledBookCheckpoint(game,options);
 assert.equal(first.status,'MARKET_REFRESH_UNAVAILABLE');
 assert.equal(first.marketResponse,null);
 const second=await runNflScheduledBookCheckpoint(game,options);
 assert.equal(second.priorAttemptOutcome,'MARKET_REFRESH_UNAVAILABLE');
 assert.equal(second.marketResponse,null);
 assert.equal(blob.calls.filter(k=>k.includes('/budget/')).length,1);
});
test('public collector audit reveals only safe codes and bounded counts',()=>{
 const r=collectorAuditReport('nfl',0,[{gameId:game.gameId,
  status:'updated',bookCheckpoint:{status:'ALREADY_ATTEMPTED_OR_STORE_UNAVAILABLE',
   stage:'DAY_AHEAD',priorAttemptOutcome:'PROVIDER_EVENT_NOT_MATCHED',
   nativeOfferRows:0,verifiedBookTiers:0,apiKey:'secret'},
  injuryWatch:{status:'compared',changesDetected:4,tokenIssued:true,
   modelRefreshStatus:'failed',modelRefreshHttpStatus:503,
   rawError:'private'}}],{due:1});
 assert.equal(r.successful,1);
 assert.equal(r.results[0].bookCheckpoint.priorAttemptOutcome,'PROVIDER_EVENT_NOT_MATCHED');
 assert.equal(r.results[0].injuryWatch.modelRefreshHttpStatus,503);
 assert.ok(!JSON.stringify(r).includes('private'));
 assert.ok(!JSON.stringify(r).includes('apiKey'));
 assert.equal(sanitizeNflCheckpointOutcome({
  gameId:game.gameId,status:'TOKEN_STORE_UNAVAILABLE',stage:'DAY_AHEAD',
  selectionId:'secret-selection',nativeOfferRows:100000}).nativeOfferRows,1000);
});
test('failed signed injury rebuild cannot block an otherwise due independent checkpoint',()=>{
 const health=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(health.includes("injuryWatch.modelRefreshStatus==='completed'"));
 assert.ok(health.includes('runNflScheduledBookCheckpoint(g,{'));
 assert.ok(market.includes("oddsDebug.propLineStage='event_not_matched'"));
 assert.ok(market.includes("oddsDebug.propLineStage='provider_response_unavailable'"));
 assert.ok(!health.includes("const bookCheckpoint=injuryWatch.tokenIssued?"));
});
