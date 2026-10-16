import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualAiAdapter} from '../lib/manual-ai-provider-adapter.js';
const request={mode:'parlay',gameId:'401234567',evidenceDigest:'a'.repeat(64),data:{gameId:'401234567'}};
test('AI adapter sends source evidence to existing endpoint',async()=>{
 let body;const adapter=createManualAiAdapter({endpoint:'https://example.test/api/ai-analysis',
 fetcher:async (_url,options)=>{body=JSON.parse(options.body);return{ok:true,json:async()=>({ok:true,aiAvailable:true,analysis:'Evidence limited',provider:'groq'})}}});
 const result=await adapter(request);assert.equal(body.mode,'parlay');assert.equal(result.evidenceDigest,request.evidenceDigest);assert.equal(result.summary,'Evidence limited');
});
test('fallback advisory without live AI is rejected',async()=>{
 const adapter=createManualAiAdapter({endpoint:'https://example.test/api/ai-analysis',fetcher:async()=>({ok:true,json:async()=>({ok:true,aiAvailable:false,analysis:'Fallback'})})});
 await assert.rejects(adapter(request),/not_verified_available/);
});
test('provider HTTP failure is rejected',async()=>{
 const adapter=createManualAiAdapter({endpoint:'https://example.test/api/ai-analysis',fetcher:async()=>({ok:false,status:429})});
 await assert.rejects(adapter(request),/http_429/);
});
test('invalid evidence digest cannot be submitted',async()=>{
 const adapter=createManualAiAdapter({endpoint:'https://example.test/api/ai-analysis',fetcher:async()=>{throw Error('should not call')}});
 await assert.rejects(adapter({...request,evidenceDigest:'wrong'}),/invalid_ai_review_request/);
});

test('oversized evidence fails before the AI endpoint is contacted',async()=>{
 let calls=0;
 const adapter=createManualAiAdapter({endpoint:'https://example.test/api/ai-analysis',fetcher:async()=>{calls++;throw Error('unexpected network request')}});
 await assert.rejects(adapter({...request,data:{gameId:'401234567',padding:'x'.repeat(36000)}}),/ai_evidence_payload_too_large/);
 assert.equal(calls,0);
});
test('evidence at normal size still reaches the AI endpoint',async()=>{
 let calls=0;
 const adapter=createManualAiAdapter({endpoint:'https://example.test/api/ai-analysis',fetcher:async()=>{calls++;return{ok:true,json:async()=>({ok:true,aiAvailable:true,analysis:'Read-only assessment'})}}});
 const result=await adapter({...request,data:{gameId:'401234567',notes:'x'.repeat(1000)}});
 assert.equal(calls,1);
 assert.equal(result.summary,'Read-only assessment');
});
