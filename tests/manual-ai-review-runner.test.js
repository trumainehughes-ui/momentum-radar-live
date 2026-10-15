import test from 'node:test';
import assert from 'node:assert/strict';
import {runManualEvidenceAiReview} from '../lib/manual-ai-review-runner.js';
const now=Date.parse('2026-10-15T12:00:00Z');
const input=()=>({sport:'NBA',game:{gameId:'401234567',home:{abbr:'DEN'},away:{abbr:'LAL'}},snapshot:{gameId:'401234567',checkedAt:'2026-10-15T11:59:00Z',sgps:[],verifiedInjuries:[]},now});
test('stale evidence prevents AI calls',async()=>{let calls=0;const a=input();a.snapshot.checkedAt='2026-10-14T11:00:00Z';a.reviewAi=async()=>{calls++};const r=await runManualEvidenceAiReview(a);assert.equal(r.status,'STALE_EVIDENCE');assert.equal(calls,0)});
test('AI review rejects wrong digest',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async()=>({gameId:'401234567',evidenceDigest:'wrong'})});assert.equal(r.status,'REVIEW_REJECTED')});
test('validated AI remains advisory only',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async p=>({gameId:p.gameId,evidenceDigest:p.evidenceDigest,summary:'Review'})});assert.equal(r.status,'AI_REVIEWED');assert.equal(r.canPublish,false)});

test('provider outage does not publish selections',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async()=>{throw Error('provider down')}});assert.equal(r.status,'AI_UNAVAILABLE');assert.equal(r.canPublish,false)});
