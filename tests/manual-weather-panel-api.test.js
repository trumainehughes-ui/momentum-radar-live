import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NFL_WEATHER_VENUES_JSON=JSON.stringify({'401234567':{gameId:'401234567',stadiumId:'test-indoor-stadium',scheduleSource:'https://example.org/schedule',roofStatus:'closed',kickoffAt:'2026-10-18T20:00:00Z'}});
import handler from '../api/manual-weather-panel.js';
async function invoke(method,body,token){
 const req={method,body,headers:{'x-manual-review-secret':token}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this},send(body){this.body=body;return this}};
 await handler(req,res);return res;
}
test('weather HTML preview requires admin authentication',async()=>{
 const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='preview-secret';
 try{assert.equal((await invoke('POST',{gameId:'401234567',venue:{gameId:'401234567',stadiumId:'test-indoor-stadium',scheduleSource:'https://example.org/schedule',roofStatus:'closed',kickoffAt:'2026-10-18T20:00:00Z'}},'bad')).code,401)}
 finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}
});
test('closed-roof weather panel returns safe read-only HTML',async()=>{
 const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='preview-secret';
 try{const r=await invoke('POST',{gameId:'401234567',venue:{gameId:'401234567',stadiumId:'test-indoor-stadium',scheduleSource:'https://example.org/schedule',roofStatus:'closed',kickoffAt:'2026-10-18T20:00:00Z'}},'preview-secret');
 assert.equal(r.code,200);assert.match(r.body,/Weather Impact/);assert.match(r.body,/INDOOR/);assert.match(r.headers['Content-Security-Policy'],/default-src 'none'/)}
 finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}
});
test('GET cannot retrieve weather HTML',async()=>assert.equal((await invoke('GET',{},'')).code,405));
