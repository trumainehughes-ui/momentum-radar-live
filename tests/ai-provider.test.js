import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai-analysis.js';
const originalKey=process.env.GROQ_API_KEY;
const originalFetch=globalThis.fetch;
const request=(mode,data,headers={})=>({method:'POST',body:{mode,data},headers});
const response=()=>({statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}});
test('provider response, cache hit, no credential exposure',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 let calls=0;
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.match(url,/api.groq.com/);assert.match(opts.headers.Authorization,/^Bearer /);
  const payload=JSON.parse(opts.body);assert.equal(payload.temperature,0.1);
  return {ok:true,json:async()=>({choices:[{message:{content:'Evidence is limited.'}}]})};
 };
 const req=request('matchup',{gameId:'mock-unique-1',home:{name:'Home'},away:{name:'Away'}});
 const first=response();await handler(req,first);
 assert.equal(first.statusCode,200);assert.equal(first.body.analysis,'Evidence is limited.');assert.equal(first.body.verified,false);
 assert.doesNotMatch(JSON.stringify(first.body),/fake-test-secret/);
 const second=response();await handler(req,second);assert.equal(second.body.cached,true);assert.equal(calls,1);
});
test('preserves deep matchup metric and parlay leg details in AI prompt',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 let prompt='';
 globalThis.fetch=async(_,opts)=>{prompt=JSON.parse(opts.body).messages[1].content;return {ok:true,json:async()=>({choices:[{message:{content:'Grounded summary.'}}]})}};
 const data={gameId:'nested-depth-test',matchup:{leagueCompletedGames:65,sides:[{offense:'PHI',opponentDefense:'JAX',defenseSampleGames:4,positions:[{position:'QB',metrics:[{metric:'passYards',defenseAllowedPerGame:287.5,defenseRankMost:2}]}]}]},sgps:[{risk:'Nuke',legs:[{name:'QB',category:'passing',modelThreshold:300,bookOdds:null}]}]};
 const res=response();await handler(request('matchup',data),res);
 assert.equal(res.statusCode,200);
 assert.match(prompt,/"defenseAllowedPerGame":287.5/);
 assert.match(prompt,/"defenseSampleGames":4/);
 assert.match(prompt,/"modelThreshold":300/);
});
test('provider refuses output that calls a rushing quarterback a running back',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:"PHI's RB Jalen Hurts averages 26.3 rushing yards."}}]})});
 const res=response();await handler(request('matchup',{gameId:'qb-rush-role-conflict',playerRoleFacts:[{name:'Jalen Hurts',team:'PHI',position:'QB'}],categories:{rushing:[{name:'Jalen Hurts',team:'PHI',position:'QB',perGame:26.3}]}}),res);
 assert.equal(res.statusCode,422);assert.equal(res.body.error,'ai_role_mismatch');
});
test('provider allows correctly attributed QB rushing analysis',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'QB Jalen Hurts averages 26.3 rushing yards per game.'}}]})});
 const res=response();await handler(request('matchup',{gameId:'qb-rush-position-correct',playerRoleFacts:[{name:'Jalen Hurts',team:'PHI',position:'QB'}]}),res);
 assert.equal(res.statusCode,200);
});
test('blocks an AI rank stolen from QB data and applied to 47.5 RB yards',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:"PHI's RB group rushed 81 yards per game; JAX's defense allowed 47.5 yards (rank 13)."}}]})});
 const matchup={sides:[{offense:'PHI',opponentDefense:'JAX',positions:[
  {position:'QB',metrics:[{metric:'rushYards',defenseAllowedPerGame:17.5,defenseRankMost:13,offenseProducedPerGame:26.3,offenseRankMost:10}]},
  {position:'RB',metrics:[{metric:'rushYards',defenseAllowedPerGame:47.5,defenseRankMost:32,offenseProducedPerGame:81,offenseRankMost:12}]}
 ]}]};
 const res=response();await handler(request('matchup',{gameId:'jax-bad-rank',matchup}),res);
 assert.equal(res.statusCode,422);assert.equal(res.body.error,'ai_stat_rank_mismatch');
});
test('allows valid paired RB and QB allowed ranks independently',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:"JAX allows RBs 47.5 yards (rank 32), and QBs 17.5 rushing yards (rank 13)."}}]})});
 const matchup={sides:[{offense:'PHI',opponentDefense:'JAX',positions:[
  {position:'QB',metrics:[{metric:'rushYards',defenseAllowedPerGame:17.5,defenseRankMost:13}]},
  {position:'RB',metrics:[{metric:'rushYards',defenseAllowedPerGame:47.5,defenseRankMost:32}]}
 ]}]};
 const res=response();await handler(request('matchup',{gameId:'jax-correct-rank',matchup}),res);
 assert.equal(res.statusCode,200);assert.equal(res.body.analysis.includes('rank 32'),true);
});
test('rank checking avoids false mismatches when a yardage value has multiple valid rankings',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'A 47.5 yards (rank 13) stat is ambiguous here.'}}]})});
 const matchup={sides:[{offense:'PHI',opponentDefense:'JAX',positions:[
  {position:'QB',metrics:[{metric:'rushYards',defenseAllowedPerGame:47.5,defenseRankMost:13}]},
  {position:'RB',metrics:[{metric:'rushYards',defenseAllowedPerGame:47.5,defenseRankMost:32}]}
 ]}]};
 const res=response();await handler(request('matchup',{gameId:'ambiguous-dvp-rank',matchup}),res);
 assert.equal(res.statusCode,200);
});
test('provider error is sanitized and leaves projections untouched',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:false,status:401});
 const res=response();await handler(request('injury',{gameId:'mock-unique-2'}),res);
 assert.equal(res.statusCode,502);assert.equal(res.body.error,'provider_auth_failed');
});
test('provider 429 surfaces controlled retry signal',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:false,status:429});
 const res=response();await handler(request('results',{gameId:'mock-unique-3'}),res);
 assert.equal(res.statusCode,429);assert.equal(res.body.error,'provider_rate_limited');
});
test('empty provider result is rejected',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[]})});
 const res=response();await handler(request('parlay',{gameId:'mock-unique-4'}),res);
 assert.equal(res.statusCode,502);assert.equal(res.body.error,'empty_ai_response');
});
test('provider network failure is handled',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>{throw Error('simulated outage')};
 const res=response();await handler(request('matchup',{gameId:'mock-unique-5'}),res);
 assert.equal(res.statusCode,502);assert.equal(res.body.error,'ai_provider_unavailable');
});
test('provider 413 token capacity limit is translated to a retry signal',async()=>{
 process.env.GROQ_API_KEY='fake-test-secret';
 globalThis.fetch=async()=>({ok:false,status:413,json:async()=>({error:{code:'rate_limit_exceeded'}})});
 const res=response();await handler(request('matchup',{gameId:'mock-capacity-limited'}),res);
 assert.equal(res.statusCode,429);
 assert.equal(res.body.error,'ai_capacity_limited');
 assert.ok(res.body.retryAfterSeconds>=60);
});
test.after(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=originalKey});
