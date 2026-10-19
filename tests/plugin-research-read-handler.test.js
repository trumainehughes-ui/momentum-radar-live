import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/plugin-research-read.js';
const saved=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};}
const request=(token,query={league:'nfl',gameId:'401873006'})=>({method:'GET',query,headers:{authorization:'Bearer '+token}});
test('plugin reader fails closed without configured secret',async()=>{
 delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 try{const res=response();await handler(request('anything'),res);assert.equal(res.statusCode,503);}finally{
 if(saved===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=saved;
 }
});
test('plugin reader rejects wrong authorization',async()=>{
 process.env.MOMENTUM_RESEARCH_INGEST_KEY='unit-test-secret-that-is-long-enough-123456789';
 try{const res=response();await handler(request('wrong'),res);assert.equal(res.statusCode,401);}finally{
 if(saved===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=saved;
 }
});
test('plugin reader rejects invalid game identifiers before reading Blob',async()=>{
 process.env.MOMENTUM_RESEARCH_INGEST_KEY='unit-test-secret-that-is-long-enough-123456789';
 try{const res=response();await handler(request('unit-test-secret-that-is-long-enough-123456789',{league:'nfl',gameId:'../../private'}),res);assert.equal(res.statusCode,400);}finally{
 if(saved===undefined)delete process.env.MOMENTUM_RESEARCH_INGEST_KEY;else process.env.MOMENTUM_RESEARCH_INGEST_KEY=saved;
 }
});
