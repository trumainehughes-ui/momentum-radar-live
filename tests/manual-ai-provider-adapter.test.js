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
