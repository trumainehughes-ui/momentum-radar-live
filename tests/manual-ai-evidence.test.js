import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManualAiReview} from '../lib/manual-ai-evidence.js';
const packet={gameId:'401234567',digest:'abc',evidence:{sgps:[{legs:[{playerId:'p1'}]}]}};
test('AI review must match exact evidence digest',()=>assert.equal(validateManualAiReview({packet,response:{gameId:'401234567',evidenceDigest:'wrong'}}).ok,false));
test('AI cannot rewrite sportsbook odds or model thresholds',()=>assert.equal(validateManualAiReview({packet,response:{gameId:'401234567',evidenceDigest:'abc',oddsChanges:[{}]}}).ok,false));
test('AI cannot reference nonexistent players',()=>assert.equal(validateManualAiReview({packet,response:{gameId:'401234567',evidenceDigest:'abc',flaggedPlayerIds:['invented']}}).ok,false));
test('source-bound advisory is allowed but cannot publish',()=>{const r=validateManualAiReview({packet,response:{gameId:'401234567',evidenceDigest:'abc',flaggedPlayerIds:['p1'],summary:'Review injury evidence'}});assert.equal(r.ok,true);assert.equal(r.canPublish,false)});

test('AI mutation fields are rejected even when empty, null or false',()=>{
 for(const field of ['playerChanges','oddsChanges','thresholdChanges','sgps','legs','picks','markets','injuries','rosterChanges','publish','canPublish']){
  const result=validateManualAiReview({packet,response:{gameId:'401234567',evidenceDigest:'abc',[field]:null}});
  assert.equal(result.ok,false,field);
  assert.equal(result.reason,'ai_attempted_authoritative_mutation',field);
 }
});
