import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/plugin-research-ingest.js';
const saved=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
const req=(body,headers={})=>({method:'POST',headers,body});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};}
test('plugin inbox fails closed without configured secret',async()=>{
 delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 try{const res=response();await handler(req({}),res);assert.equal(res.statusCode,503);}finally{
 if(saved===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=saved;
 }
});
test('plugin inbox refuses unauthorized requests before touching storage',async()=>{
 process.env.MOMENTUM_RESEARCH_INGEST_KEY='unit-test-secret-that-is-long-enough-123456789';
 try{const res=response();await handler(req({}, {authorization:'Bearer wrong'}),res);assert.equal(res.statusCode,401);}finally{
 if(saved===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=saved;
 }
});
test('plugin inbox enforces JSON payload limit without Content-Length',async()=>{
 process.env.MOMENTUM_RESEARCH_INGEST_KEY='unit-test-secret-that-is-long-enough-123456789';
 try{const res=response();await handler(req({extra:'x'.repeat(21000)},{authorization:'Bearer unit-test-secret-that-is-long-enough-123456789'}),res);assert.equal(res.statusCode,413);}finally{
 if(saved===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=saved;
 }
});

test('plugin inbox reports missing Blob storage without writing',async()=>{
 const originalKey=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 const originalBlob=process.env.BLOB_READ_WRITE_TOKEN;
 process.env.MOMENTUM_RESEARCH_INGEST_KEY='unit-test-secret-that-is-long-enough-123456789';
 delete process.env.BLOB_READ_WRITE_TOKEN;
 try{
  const body={provider:'DraftKings',league:'NFL',gameId:'401873006',
   observedAt:new Date().toISOString(),observations:[{type:'team_stat',
    subject:'Example Team',description:'Example research observation',sourceReference:'test-source'}]};
  const res=response();
  await handler(req(body,{authorization:'Bearer unit-test-secret-that-is-long-enough-123456789'}),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.error,'research_storage_not_configured');
 }finally{
  if(originalKey===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;
  else process.env.MOMENTUM_RESEARCH_INGEST_KEY=originalKey;
  if(originalBlob===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN=originalBlob;
 }
});
