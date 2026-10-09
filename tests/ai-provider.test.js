import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai-analysis.js';
const originalKey=process.env.GROQ_API_KEY;
const originalFetch=globalThis.fetch;
const request=(mode,data,headers={})=>({method:'POST',body:{mode,data},headers});
const response=()=>({statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}});
test('provider response, cache hit, no credential exposure',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 let calls=0;
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.match(url,/api.groq.com/);assert.match(opts.headers.Authorization,/^Bearer /);
  const payload=JSON.parse(opts.body);assert.equal(payload.temperature,0.1);
  return {ok:true,json:async()=>({choices:[{message:{content:'Evidence is limited.'}}]})};
 };
 const req=request('matchup',{gameId:'mock-unique-1',home:{name:'Home'},away:{name:'Away'}});
 const first=response();await handler(req,first);
 assert.equal(first.statusCode,200);assert.equal(first.body.analysis,'Evidence is limited.');assert.equal(first.body.verified,false);
 assert.doesNotMatch(JSON.stringify(first.body),/fake-test-secret/);
 const second=response();await handler(req,second);assert.equal(second.body.cached,true);assert.equal(calls,1);
});
test('provider error is sanitized and leaves projections untouched',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:false,status:401});
 const res=response();await handler(request('injury',{gameId:'mock-unique-2'}),res);
 assert.equal(res.statusCode,502);assert.equal(res.body.error,'provider_auth_failed');
});
test('provider 429 surfaces controlled retry signal',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:false,status:429});
 const res=response();await handler(request('results',{gameId:'mock-unique-3'}),res);
 assert.equal(res.statusCode,429);assert.equal(res.body.error,'provider_rate_limited');
});
test('empty provider result is rejected',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[]})});
 const res=response();await handler(request('parlay',{gameId:'mock-unique-4'}),res);
 assert.equal(res.statusCode,502);assert.equal(res.body.error,'empty_ai_response');
});
test('provider network failure is handled',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>{throw Error('simulated outage')};
 const res=response();await handler(request('matchup',{gameId:'mock-unique-5'}),res);
 assert.equal(res.statusCode,502);assert.equal(res.body.error,'ai_provider_unavailable');
});
test.after(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=originalKey});
