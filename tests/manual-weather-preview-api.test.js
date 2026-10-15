import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/manual-weather-preview.js';
async function invoke(method,body,token){
 const req={method,body,headers:{'x-manual-review-secret':token}};
 const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await handler(req,res);return res;
}
test('kickoff weather preview requires separate manual admin credential',async()=>{
 const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='weather-secret';
 try{
  assert.equal((await invoke('POST',{gameId:'401234567',venue:{roofStatus:'closed'}},'wrong')).code,401);
  assert.equal((await invoke('POST',{gameId:'401234567',venue:{roofStatus:'closed'}},'weather-secret')).code,200);
 }finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}
});
test('closed-roof weather preview is advisory and has no sportsbook calls',async()=>{
 const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='weather-secret';
 try{const r=await invoke('POST',{gameId:'401234567',venue:{roofStatus:'closed'}},'weather-secret');
 assert.equal(r.body.assessment.status,'INDOOR');assert.equal(r.body.publicationBlocked,true);assert.equal(r.body.paidSportsApiCalls,0)}
 finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}
});
test('GET is disallowed on weather preview',async()=>assert.equal((await invoke('GET',{},'')).code,405));
