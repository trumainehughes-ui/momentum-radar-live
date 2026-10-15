import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{authorizedManualReview} from '../api/manual-ai-review.js';
test('manual AI review rejects missing secret',()=>assert.equal(authorizedManualReview({headers:{authorization:'Bearer x'}},''),false));
test('manual AI review rejects missing authorization',()=>assert.equal(authorizedManualReview({headers:{}},'secret'),false));
test('manual AI review accepts exact server bearer token',()=>assert.equal(authorizedManualReview({headers:{authorization:'Bearer secret'}},'secret'),true));
test('manual AI review rejects altered token',()=>assert.equal(authorizedManualReview({headers:{authorization:'Bearer secret1'}},'secret'),false));

function response(){return{headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(data){this.body=data;return this}}}
test('GET cannot execute manual review',async()=>{const res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.statusCode,405);assert.equal(res.headers['Cache-Control'],'private, no-store')});
test('POST without credentials is rejected before any blob access',async()=>{const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='test-only-secret';try{const res=response();await handler({method:'POST',headers:{},body:{sport:'NBA',gameId:'401234567'}},res);assert.equal(res.statusCode,401);assert.equal(res.body.error,'unauthorized')}finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}});
test('authorized invalid matchup is rejected without provider spend',async()=>{const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='test-only-secret';try{const res=response();await handler({method:'POST',headers:{authorization:'Bearer test-only-secret'},body:{sport:'NBA',gameId:'not-an-id'}},res);assert.equal(res.statusCode,400);assert.equal(res.body.error,'invalid_game')}finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}});

test('scheduler credential cannot authorize manual AI review',async()=>{
 const previousManual=process.env.MANUAL_AI_REVIEW_SECRET;
 const previousCron=process.env.CRON_SECRET;
 process.env.MANUAL_AI_REVIEW_SECRET='review-only-test-secret';
 process.env.CRON_SECRET='scheduler-only-test-secret';
 try{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer scheduler-only-test-secret'},body:{sport:'NFL',gameId:'401234567'}},res);
  assert.equal(res.statusCode,401);
  assert.equal(res.body.error,'unauthorized');
 }finally{
  if(previousManual===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;
  else process.env.MANUAL_AI_REVIEW_SECRET=previousManual;
  if(previousCron===undefined)delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET=previousCron;
 }
});
test('manual AI review fails closed if its dedicated secret is not configured',async()=>{
 const previousManual=process.env.MANUAL_AI_REVIEW_SECRET;
 const previousCron=process.env.CRON_SECRET;
 delete process.env.MANUAL_AI_REVIEW_SECRET;
 process.env.CRON_SECRET='scheduler-only-test-secret';
 try{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer scheduler-only-test-secret'},body:{sport:'NFL',gameId:'401234567'}},res);
  assert.equal(res.statusCode,401);
  assert.equal(res.body.error,'unauthorized');
 }finally{
  if(previousManual===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;
  else process.env.MANUAL_AI_REVIEW_SECRET=previousManual;
  if(previousCron===undefined)delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET=previousCron;
 }
});
