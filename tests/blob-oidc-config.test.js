import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blobCredentialMode,blobStorageReadiness} from '../lib/blob-storage-config.js';
import {pregameReadiness} from '../api/pregame-readiness.js';
import nbaCollector from '../api/nba-health.js';
import nflCollector from '../api/nfl-health.js';
const res=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.statusCode=n;return this},json(x){this.body=x;return this}});
const restores=new Map();
const set=(name,value)=>{if(!restores.has(name))restores.set(name,process.env[name]);
 if(value===null)delete process.env[name];else process.env[name]=value};
function reset(){for(const [key,value] of restores){if(value===undefined)delete process.env[key];else process.env[key]=value}restores.clear()}
test('legacy and modern Blob OIDC modes are both supported; bare store ID outside Vercel is not enough',()=>{
 assert.equal(blobCredentialMode({}),'NOT_CONFIGURED');
 assert.equal(blobCredentialMode({BLOB_STORE_ID:'store_abc'}),'NOT_CONFIGURED');
 assert.equal(blobCredentialMode({BLOB_STORE_ID:'store_abc',VERCEL:'1'}),'OIDC');
 assert.equal(blobCredentialMode({BLOB_STORE_ID:'store_abc',VERCEL_OIDC_TOKEN:'secret'}),'OIDC');
 assert.equal(blobCredentialMode({BLOB_READ_WRITE_TOKEN:'secret'}),'READ_WRITE_TOKEN');
 assert.equal(blobCredentialMode({BLOB_STORE_ID:'store_abc',VERCEL:'1',BLOB_READ_WRITE_TOKEN:'legacy'}),'OIDC');
 const oidc=blobStorageReadiness({BLOB_STORE_ID:'store_abc',VERCEL:'1'});
 assert.equal(oidc.configured,true);
 assert.equal(oidc.mode,'OIDC');
 assert.equal(oidc.validated,false);
 assert.ok(!JSON.stringify(oidc).includes('store_abc'));
});
test('readiness shows OIDC configured but does not imply actual Blob read/write succeeded',()=>{
 const d=pregameReadiness({BLOB_STORE_ID:'store_abc',VERCEL:'1',CRON_SECRET:'not-shared'});
 assert.equal(d.status,'CONFIGURED');
 assert.equal(d.storage.mode,'OIDC');
 assert.equal(d.storage.validated,false);
 assert.equal(d.nfl.collectorReady,true);
 assert.equal(d.nba.collectorReady,true);
 assert.equal(d.readinessScope,'CONFIGURATION_ONLY');
 assert.equal(d.cronExecutionVerified,false);
 assert.equal(d.blobReadWriteVerified,false);
 assert.equal(d.sportsbookCollectionVerified,false);
 assert.ok(!JSON.stringify(d).includes('not-shared'));
});
test('readiness distinguishes missing cron credentials from missing Blob storage',()=>{
 const preview=pregameReadiness({BLOB_STORE_ID:'store_abc',VERCEL:'1'});
 assert.equal(preview.status,'BLOCKED');
 assert.deepEqual(preview.blockers,['CRON_SECRET_MISSING']);
 assert.match(preview.nextStep,/CRON_SECRET/);
 const missingStore=pregameReadiness({CRON_SECRET:'private'});
 assert.deepEqual(missingStore.blockers,['BLOB_STORAGE_NOT_CONFIGURED']);
 const neither=pregameReadiness({});
 assert.deepEqual(neither.blockers,['CRON_SECRET_MISSING','BLOB_STORAGE_NOT_CONFIGURED']);
 const configured=pregameReadiness({BLOB_STORE_ID:'store_abc',VERCEL:'1',CRON_SECRET:'private'});
 assert.deepEqual(configured.blockers,[]);
 assert.ok(!JSON.stringify(configured).includes('private'));
});
test('NBA collector OIDC passes storage preflight on Vercel and fails only if source is unavailable',async()=>{
 const oldFetch=globalThis.fetch;
 let calls=[];
 set('CRON_SECRET','test-cron');
 set('BLOB_READ_WRITE_TOKEN',null);
 set('BLOB_STORE_ID','store_fake');
 set('VERCEL','1');
 globalThis.fetch=async url=>{
  calls.push(String(url));
  return {ok:true,json:async()=>({events:[]})};
 };
 try{
  const response=res();
  await nbaCollector({method:'GET',headers:{authorization:'Bearer test-cron'}},response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.ok,true);
  assert.equal(response.body.games,0);
  assert.equal(calls.length,2,'both day scopes checked');
 }finally{globalThis.fetch=oldFetch;reset()}
});
test('NFL collector OIDC passes preflight and preserves public auth protection',async()=>{
 let calls=[];
 const oldFetch=globalThis.fetch;
 set('CRON_SECRET','test-cron');
 set('BLOB_READ_WRITE_TOKEN',null);
 set('BLOB_STORE_ID','store_fake');
 set('VERCEL','1');
 set('VERCEL_ENV','production');
 set('VERCEL_PROJECT_PRODUCTION_URL','momentum-radar-live.vercel.app');
 globalThis.fetch=async url=>{
  calls.push(String(url));
  return {ok:true,json:async()=>({ok:true,games:[],week:1})};
 };
 try{
  const denied=res();
  await nflCollector({method:'GET',query:{cron:'1'},headers:{host:'example.test'}},denied);
  assert.equal(denied.statusCode,401);
  assert.equal(calls.length,0);
  const authed=res();
  await nflCollector({method:'GET',query:{cron:'1'},headers:{host:'example.test',
   authorization:'Bearer test-cron'}},authed);
  assert.equal(authed.statusCode,503,'no ESPN games is not a storage error');
  assert.equal(authed.body.blocking[0],'games');
  assert.equal(calls.length,2);
 }finally{globalThis.fetch=oldFetch;reset()}
});
test('NFL preview collector uses its own deployment and refuses production fallback',async()=>{
 const oldFetch=globalThis.fetch;
 const calls=[];
 set('CRON_SECRET','test-cron');
 set('BLOB_READ_WRITE_TOKEN',null);
 set('BLOB_STORE_ID','store_fake');
 set('VERCEL','1');
 set('VERCEL_ENV','preview');
 set('VERCEL_URL','momentum-radar-live-preview123-trumainehughes-6743.vercel.app');
 set('VERCEL_PROJECT_PRODUCTION_URL','momentum-radar-live.vercel.app');
 globalThis.fetch=async url=>{
  calls.push(String(url));
  return {ok:true,json:async()=>({ok:true,games:[],week:1})};
 };
 try{
  const req={method:'GET',query:{cron:'1'},headers:{authorization:'Bearer test-cron'}};
  const preview=res();
  await nflCollector(req,preview);
  assert.equal(preview.statusCode,503,'empty schedule still blocks collection');
  assert.equal(preview.body.blocking[0],'games');
  assert.equal(calls.length,2);
  assert.ok(calls.every(url=>url.startsWith('https://momentum-radar-live-preview123-trumainehughes-6743.vercel.app/')));
  calls.length=0;
  set('VERCEL_URL','momentum-radar-live.vercel.app');
  const refused=res();
  await nflCollector(req,refused);
  assert.equal(refused.statusCode,503);
  assert.equal(refused.body.error,'trusted_deployment_origin_unavailable');
  assert.equal(calls.length,0,'preview must not contact production');
 }finally{globalThis.fetch=oldFetch;reset()}
});
test('three authenticated daily collectors no longer hardcode BLOB_READ_WRITE_TOKEN',()=>{
 for(const path of ['api/nba-health.js','api/nfl-health.js','api/bdl-refresh.js']){
  const code=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.ok(code.includes('blobCredentialMode(process.env)'),path);
  assert.ok(!code.includes('if(!process.env.BLOB_READ_WRITE_TOKEN)'),path);
 }
});
