import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NFL_WEATHER_VENUES_JSON=JSON.stringify({'401234567':{gameId:'401234567',stadiumId:'stadium-verified',scheduleSource:'https://www.nfl.com/schedules/2026/reg18/',roofStatus:'closed',kickoffAt:'2026-10-18T20:00:00Z',awayTeam:'DEN',homeTeam:'KC',stadiumEvidence:{url:'https://www.nfl.com/stadiums/',stadiumId:'stadium-verified',checkedAt:'2026-10-15T16:00:00Z',verificationMethod:'fetched_source',verificationStatus:'verified',sourceGameId:'401234567'}}});
import handler from '../api/manual-weather-panel.js';
async function invoke(method,body,token){
 const req={method,body,headers:{'x-manual-review-secret':token}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this},send(body){this.body=body;return this}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({header:{id:'401234567',competitions:[{id:'401234567',date:'2026-10-18T20:00:00Z',competitors:[{team:{abbreviation:'DEN'}},{team:{abbreviation:'KC'}}]}]}})});
 try{await handler(req,res)}finally{globalThis.fetch=previous}return res;
}
test('weather HTML preview requires admin authentication',async()=>{
 const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='preview-secret';
 try{assert.equal((await invoke('POST',{gameId:'401234567'},'bad')).code,401)}
 finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}
});
test('closed-roof weather panel returns safe read-only HTML',async()=>{
 const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='preview-secret';
 try{const r=await invoke('POST',{gameId:'401234567'},'preview-secret');
 assert.equal(r.code,200);assert.match(r.body,/Weather Impact/);assert.match(r.body,/INDOOR/);assert.match(r.headers['Content-Security-Policy'],/default-src 'none'/)}
 finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}
});
test('GET cannot retrieve weather HTML',async()=>assert.equal((await invoke('GET',{},'')).code,405));

test('caller cannot override server-owned stadium roof',async()=>{
 const old=process.env.MANUAL_AI_REVIEW_SECRET;process.env.MANUAL_AI_REVIEW_SECRET='preview-secret';
 try{
  const r=await invoke('POST',{gameId:'401234567',venue:{roofStatus:'outdoor',latitude:39.7,longitude:-105.0,venueSource:'fake'}},'preview-secret');
  assert.equal(r.code,200);
  assert.match(r.body,/INDOOR/);
 }finally{if(old===undefined)delete process.env.MANUAL_AI_REVIEW_SECRET;else process.env.MANUAL_AI_REVIEW_SECRET=old}
});
