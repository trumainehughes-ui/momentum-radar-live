import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/manual-weather-report.js';
const call=async(method,body,secret='secret')=>{
 const req={method,body,headers:{'x-manual-review-secret':secret}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(x){this.body=x;return this}};
 await handler(req,res);return res;
};
test('weather report rejects unauthenticated access',async()=>{const prior=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='secret';try{assert.equal((await call('POST',{},'wrong')).code,401)}finally{if(prior===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=prior}});
test('weather report rejects GET and does not expose data',async()=>{const r=await call('GET',{});assert.equal(r.code,405)});
test('weather report returns advisory-only data to authorized request',async()=>{
 const prior=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='secret';
 try{
 const r=await call('POST',{gameId:'401234567',playerId:'qb1',playerName:'Test QB',stat:'passingYards',historyRows:[],venue:{roofStatus:'closed'}});
 assert.equal(r.code,200);assert.equal(r.body.canPublish,false);assert.equal(r.body.paidSportsApiCalls,0);assert.equal(r.body.publicationBlocked,true);
 }finally{if(prior===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=prior}
});
