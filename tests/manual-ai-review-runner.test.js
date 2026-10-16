import test from 'node:test';
import assert from 'node:assert/strict';
import {runManualEvidenceAiReview} from '../lib/manual-ai-review-runner.js';
const now=Date.parse('2026-10-15T12:00:00Z');
const input=()=>({sport:'NBA',game:{gameId:'401234567',home:{abbr:'DEN'},away:{abbr:'LAL'}},snapshot:{gameId:'401234567',checkedAt:'2026-10-15T11:59:00Z',sgps:[{risk:'Small',legs:[{playerId:'p1',team:'DEN',name:'Test Player',category:'points',threshold:15}]}],verifiedInjuries:[]},now});
test('stale evidence prevents AI calls',async()=>{let calls=0;const a=input();a.snapshot.checkedAt='2026-10-14T11:00:00Z';a.reviewAi=async()=>{calls++};const r=await runManualEvidenceAiReview(a);assert.equal(r.status,'STALE_EVIDENCE');assert.equal(calls,0)});
test('AI review rejects wrong digest',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async()=>({gameId:'401234567',evidenceDigest:'wrong'})});assert.equal(r.status,'REVIEW_REJECTED')});
test('validated AI remains advisory only',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async p=>({gameId:p.gameId,evidenceDigest:p.evidenceDigest,summary:'Review'})});assert.equal(r.status,'AI_REVIEWED');assert.equal(r.canPublish,false)});

test('provider outage does not publish selections',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async()=>{throw Error('provider down')}});assert.equal(r.status,'AI_UNAVAILABLE');assert.equal(r.canPublish,false)});

test('empty model candidates do not invoke AI',async()=>{let calls=0;const a=input();a.snapshot.sgps=[];a.reviewAi=async()=>{calls++};const r=await runManualEvidenceAiReview(a);assert.equal(r.status,'NO_ELIGIBLE_CANDIDATES');assert.equal(calls,0)});

test('future-dated evidence cannot trigger AI',async()=>{let calls=0;const a=input();a.snapshot.checkedAt='2026-10-15T12:01:00Z';a.reviewAi=async()=>{calls++};const r=await runManualEvidenceAiReview(a);assert.equal(r.status,'STALE_EVIDENCE');assert.equal(calls,0);assert.equal(r.canPublish,false)});
test('snapshot without a trustworthy timestamp cannot trigger AI',async()=>{let calls=0;const a=input();delete a.snapshot.checkedAt;a.reviewAi=async()=>{calls++};const r=await runManualEvidenceAiReview(a);assert.equal(r.status,'STALE_EVIDENCE');assert.equal(calls,0)});
test('review cannot change authoritative player thresholds',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async p=>({gameId:p.gameId,evidenceDigest:p.evidenceDigest,summary:'raise points',thresholdChanges:[{playerId:'p1',threshold:25}]})});assert.equal(r.status,'REVIEW_REJECTED');assert.equal(r.reason,'ai_attempted_authoritative_mutation');assert.equal(r.canPublish,false)});

test('AI cannot cite a player absent from source evidence',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async p=>({gameId:p.gameId,evidenceDigest:p.evidenceDigest,summary:'review',flaggedPlayerIds:['unknown-player']})});assert.equal(r.status,'REVIEW_REJECTED');assert.equal(r.reason,'unrecognized_player_reference');assert.equal(r.canPublish,false)});
test('AI cannot substitute another game identity',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async p=>({gameId:'401999999',evidenceDigest:p.evidenceDigest,summary:'review'})});assert.equal(r.status,'REVIEW_REJECTED');assert.equal(r.reason,'evidence_digest_mismatch');assert.equal(r.canPublish,false)});
test('accepted review cannot publish or charge sports-data APIs',async()=>{const r=await runManualEvidenceAiReview({...input(),reviewAi:async p=>({gameId:p.gameId,evidenceDigest:p.evidenceDigest,summary:'review'})});assert.equal(r.status,'AI_REVIEWED');assert.equal(r.canPublish,false);assert.equal(r.paidSportsApiCalls,0);assert.equal(r.advisoryOnly,true)});

test('successful advisory review leaves the authoritative cached snapshot unchanged',async()=>{
 const args=input();
 const before=structuredClone(args.snapshot);
 const result=await runManualEvidenceAiReview({...args,reviewAi:async p=>({gameId:p.gameId,evidenceDigest:p.evidenceDigest,summary:'Read-only assessment'})});
 assert.equal(result.status,'AI_REVIEWED');
 assert.equal(result.canPublish,false);
 assert.deepEqual(args.snapshot,before);
});
test('rejected AI mutation attempt leaves the cached snapshot unchanged',async()=>{
 const args=input();
 const before=structuredClone(args.snapshot);
 const result=await runManualEvidenceAiReview({...args,reviewAi:async p=>({gameId:p.gameId,evidenceDigest:p.evidenceDigest,thresholdChanges:[{playerId:'p1',threshold:999}]})});
 assert.equal(result.status,'REVIEW_REJECTED');
 assert.equal(result.canPublish,false);
 assert.deepEqual(args.snapshot,before);
});
